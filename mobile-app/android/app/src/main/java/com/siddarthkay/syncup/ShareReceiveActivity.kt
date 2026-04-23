package com.siddarthkay.syncup

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.util.Log
import android.widget.Toast
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

// headless share target; cold-launch safe because we parse config.xml off disk.
class ShareReceiveActivity : Activity() {

    companion object {
        private const val TAG = "ShareReceiveActivity"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val uris = extractUris(intent)
        if (uris.isEmpty()) {
            toast("No files in share")
            finish()
            return
        }

        // we write to disk either way; a live daemon just means rescan works.
        SyncthingService.start(applicationContext)

        val parsed = ConfigParser.parse(applicationContext)
        if (parsed == null || parsed.folders.isEmpty()) {
            toast("No syncthing folders configured. Open Syncthing and add a folder first.")
            finish()
            return
        }

        showFolderPicker(parsed, uris)
    }

    private fun extractUris(intent: Intent): List<Uri> {
        val out = mutableListOf<Uri>()
        when (intent.action) {
            Intent.ACTION_SEND -> {
                getStreamExtra(intent, Intent.EXTRA_STREAM)?.let { out.add(it) }
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                val list = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
                }
                if (list != null) out.addAll(list)
            }
        }
        return out
    }

    private fun getStreamExtra(intent: Intent, key: String): Uri? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(key, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(key)
        }
    }

    private fun showFolderPicker(parsed: ConfigParser.ParsedConfig, uris: List<Uri>) {
        val labels = parsed.folders.map { it.label }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Share to folder")
            .setItems(labels) { _, which ->
                val target = parsed.folders[which]
                handleCopyAndScan(target, parsed, uris)
            }
            .setNegativeButton("Cancel") { _, _ -> finish() }
            .setOnCancelListener { finish() }
            .show()
    }

    private fun handleCopyAndScan(
        target: ConfigParser.FolderEntry,
        parsed: ConfigParser.ParsedConfig,
        uris: List<Uri>,
    ) {
        // copy off the main thread or we ANR on big files.
        Thread {
            val results = uris.map { copyOne(it, target.path) }
            val ok = results.count { it.success }
            val failed = results.size - ok
            val firstError = results.firstOrNull { !it.success }?.error
            // best-effort; watcher / periodic rescan is the safety net.
            if (ok > 0) {
                requestScan(parsed.guiAddress, parsed.apiKey, target.id)
            }
            runOnUiThread {
                val msg = when {
                    failed == 0 && ok == 1 -> "Saved to ${target.label}"
                    failed == 0 -> "Saved $ok files to ${target.label}"
                    ok == 0 -> "Failed: ${firstError ?: "unknown"}"
                    else -> "Saved $ok of ${results.size} (some failed)"
                }
                toast(msg)
                finish()
            }
        }.start()
    }

    private data class CopyResult(val success: Boolean, val error: String? = null)

    private fun copyOne(uri: Uri, destDir: String): CopyResult {
        return try {
            val name = resolveDisplayName(uri) ?: defaultName(uri)
            val safeName = sanitizeFilename(name)
            if (destDir.startsWith("content://")) {
                copyToSaf(uri, Uri.parse(destDir), safeName)
            } else {
                copyToPosix(uri, destDir, safeName)
            }
        } catch (e: Exception) {
            Log.e(TAG, "copy failed for $uri", e)
            CopyResult(false, e.message ?: e.javaClass.simpleName)
        }
    }

    private fun copyToPosix(srcUri: Uri, destDir: String, name: String): CopyResult {
        val destFile = uniquePath(File(destDir), name)
        destFile.parentFile?.mkdirs()
        contentResolver.openInputStream(srcUri)?.use { input ->
            FileOutputStream(destFile).use { output ->
                input.copyTo(output)
            }
        } ?: return CopyResult(false, "openInputStream returned null")
        Log.i(TAG, "copied ${destFile.absolutePath}")
        return CopyResult(true)
    }

    // DocumentsContract.createDocument on the primary external-storage provider
    // auto-appends " (1)", " (2)" etc on name collision, so we skip manual uniqueness.
    private fun copyToSaf(srcUri: Uri, treeUri: Uri, name: String): CopyResult {
        val parentDocId = DocumentsContract.getTreeDocumentId(treeUri)
        val parentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, parentDocId)
        val mimeType = contentResolver.getType(srcUri) ?: "application/octet-stream"
        val newUri = DocumentsContract.createDocument(contentResolver, parentUri, mimeType, name)
            ?: return CopyResult(false, "createDocument returned null")
        contentResolver.openInputStream(srcUri)?.use { input ->
            contentResolver.openOutputStream(newUri)?.use { output ->
                input.copyTo(output)
            } ?: return CopyResult(false, "openOutputStream returned null")
        } ?: return CopyResult(false, "openInputStream returned null")
        Log.i(TAG, "copied SAF $newUri")
        return CopyResult(true)
    }

    private fun resolveDisplayName(uri: Uri): String? {
        val cursor = contentResolver.query(uri, null, null, null, null) ?: return null
        cursor.use {
            val nameIdx = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (nameIdx >= 0 && it.moveToFirst()) {
                return it.getString(nameIdx)
            }
        }
        return null
    }

    private fun defaultName(uri: Uri): String {
        val last = uri.lastPathSegment ?: "shared"
        return last.substringAfterLast('/').ifEmpty { "shared" }
    }

    private fun sanitizeFilename(name: String): String {
        return name.replace(Regex("[\\\\/:*?\"<>|]"), "_").take(200)
    }

    private fun uniquePath(dir: File, name: String): File {
        val initial = File(dir, name)
        if (!initial.exists()) return initial
        val dot = name.lastIndexOf('.')
        val base = if (dot > 0) name.substring(0, dot) else name
        val ext = if (dot > 0) name.substring(dot) else ""
        var i = 1
        while (true) {
            val candidate = File(dir, "$base ($i)$ext")
            if (!candidate.exists()) return candidate
            i++
        }
    }

    private fun requestScan(guiAddress: String, apiKey: String, folderId: String) {
        if (apiKey.isEmpty() || guiAddress.isEmpty()) return
        try {
            val base = if (guiAddress.startsWith("http")) guiAddress else "http://$guiAddress"
            val url = URL("$base/rest/db/scan?folder=${URLEncoder.encode(folderId, "UTF-8")}")
            val conn = url.openConnection() as HttpURLConnection
            try {
                conn.requestMethod = "POST"
                conn.setRequestProperty("X-API-Key", apiKey)
                conn.connectTimeout = 2000
                conn.readTimeout = 2000
                val code = conn.responseCode
                Log.i(TAG, "scan request returned $code")
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            Log.w(TAG, "scan request failed (best-effort)", e)
        }
    }

    private fun toast(text: String) {
        Toast.makeText(applicationContext, text, Toast.LENGTH_LONG).show()
    }
}

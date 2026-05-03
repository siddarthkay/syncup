package com.siddarthkay.syncup

import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule

import gobridge.MobileAPI

@ReactModule(name = GoServerBridgeModule.NAME)
class GoServerBridgeModule(reactContext: ReactApplicationContext) :
    NativeGoServerBridgeSpec(reactContext) {

    companion object {
        const val NAME = "GoServerBridge"

        init {
            System.loadLibrary("gojni")
        }
    }

    private val mobileAPI = MobileAPI()
    private val ctx = reactContext
    private val safProvider = SAFProvider(reactContext.applicationContext)

    init {
        // Wire the SAF bridge so Go's "saf" filesystem type can call through to Kotlin.
        mobileAPI.setSAFBridge(safProvider)
    }

    override fun getName(): String = NAME

    override fun startServer(): Double {
        return try {
            // safe to re-enter; Android coalesces duplicate startForegroundService.
            SyncthingService.start(ctx)
            // go side is idempotent via globalClient. stash foldersRoot first
            // so a JS-triggered restart still hits the Load migration path.
            val dataDir = Paths.syncthingDir(ctx)
            val foldersRoot = Paths.foldersRoot(ctx)
            mobileAPI.setFoldersRoot(foldersRoot)
            mobileAPI.startServer(dataDir).toDouble()
        } catch (e: Exception) {
            android.util.Log.e(NAME, "startServer failed", e)
            0.0
        }
    }

    override fun stopServer(): Boolean {
        return try {
            SyncthingService.stop(ctx)
            true
        } catch (e: Exception) {
            false
        }
    }

    override fun getServerPort(): Double {
        return try {
            mobileAPI.getServerPort().toDouble()
        } catch (e: Exception) {
            0.0
        }
    }

    override fun getApiKey(): String {
        return try {
            mobileAPI.getAPIKey() ?: ""
        } catch (e: Exception) {
            ""
        }
    }

    override fun getDeviceId(): String {
        return try {
            mobileAPI.getDeviceID() ?: ""
        } catch (e: Exception) {
            ""
        }
    }

    override fun getGuiAddress(): String {
        return try {
            mobileAPI.getGUIAddress() ?: ""
        } catch (e: Exception) {
            ""
        }
    }

    override fun getDataDir(): String {
        return try {
            mobileAPI.getDataDir() ?: ""
        } catch (e: Exception) {
            ""
        }
    }

    override fun listSubdirs(path: String): String {
        return try {
            mobileAPI.listSubdirs(path) ?: "{\"error\":\"nil result\"}"
        } catch (e: Exception) {
            android.util.Log.e(NAME, "listSubdirs failed", e)
            "{\"error\":\"${e.message}\"}"
        }
    }

    override fun mkdirSubdir(parent: String, name: String): String {
        return try {
            mobileAPI.mkdirSubdir(parent, name) ?: "{\"error\":\"nil result\"}"
        } catch (e: Exception) {
            android.util.Log.e(NAME, "mkdirSubdir failed", e)
            "{\"error\":\"${e.message}\"}"
        }
    }

    override fun removeDir(path: String): String {
        return try {
            mobileAPI.removeDir(path) ?: "{\"error\":\"nil result\"}"
        } catch (e: Exception) {
            android.util.Log.e(NAME, "removeDir failed", e)
            "{\"error\":\"${e.message}\"}"
        }
    }

    override fun copyFile(src: String, dst: String): String {
        return try {
            mobileAPI.copyFile(src, dst) ?: "{\"error\":\"nil result\"}"
        } catch (e: Exception) {
            android.util.Log.e(NAME, "copyFile failed", e)
            "{\"error\":\"${e.message}\"}"
        }
    }

    override fun resolvePath(path: String): String {
        return try {
            mobileAPI.resolvePath(path) ?: "{\"error\":\"nil result\"}"
        } catch (e: Exception) {
            android.util.Log.e(NAME, "resolvePath failed", e)
            "{\"error\":\"${e.message}\"}"
        }
    }

    override fun zipDir(srcDir: String, dstPath: String): String {
        return try {
            mobileAPI.zipDir(srcDir, dstPath) ?: "{\"error\":\"nil result\"}"
        } catch (e: Exception) {
            android.util.Log.e(NAME, "zipDir failed", e)
            "{\"error\":\"${e.message}\"}"
        }
    }

    override fun setSuspended(suspended: Boolean) {
        try {
            mobileAPI.setSuspended(suspended)
        } catch (e: Exception) {
            android.util.Log.e(NAME, "setSuspended failed", e)
        }
    }

    override fun getWifiOnlySync(): Boolean {
        return SyncthingPrefs.getWifiOnlySync(ctx)
    }

    override fun setWifiOnlySync(enabled: Boolean): Boolean {
        SyncthingPrefs.setWifiOnlySync(ctx, enabled)
        try {
            SyncthingService.requestConditionEvaluation(ctx)
        } catch (e: Exception) {
            android.util.Log.w(NAME, "requestConditionEvaluation failed", e)
        }
        return true
    }

    override fun getChargingOnlySync(): Boolean {
        return SyncthingPrefs.getChargingOnlySync(ctx)
    }

    override fun setChargingOnlySync(enabled: Boolean): Boolean {
        SyncthingPrefs.setChargingOnlySync(ctx, enabled)
        try {
            SyncthingService.requestConditionEvaluation(ctx)
        } catch (e: Exception) {
            android.util.Log.w(NAME, "requestConditionEvaluation failed", e)
        }
        return true
    }

    override fun getAllowMeteredWifi(): Boolean {
        return SyncthingPrefs.getAllowMeteredWifi(ctx)
    }

    override fun setAllowMeteredWifi(enabled: Boolean): Boolean {
        SyncthingPrefs.setAllowMeteredWifi(ctx, enabled)
        try {
            SyncthingService.requestConditionEvaluation(ctx)
        } catch (e: Exception) {
            android.util.Log.w(NAME, "requestConditionEvaluation failed", e)
        }
        return true
    }

    override fun getAllowMobileData(): Boolean {
        return SyncthingPrefs.getAllowMobileData(ctx)
    }

    override fun setAllowMobileData(enabled: Boolean): Boolean {
        SyncthingPrefs.setAllowMobileData(ctx, enabled)
        try {
            SyncthingService.requestConditionEvaluation(ctx)
        } catch (e: Exception) {
            android.util.Log.w(NAME, "requestConditionEvaluation failed", e)
        }
        return true
    }

    override fun isIgnoringBatteryOptimizations(): Boolean {
        return try {
            val pm = ctx.getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager
            pm.isIgnoringBatteryOptimizations(ctx.packageName)
        } catch (e: Exception) {
            android.util.Log.w(NAME, "isIgnoringBatteryOptimizations failed", e)
            false
        }
    }

    override fun openBatteryOptimizationSettings(): Boolean {
        val pkgUri = android.net.Uri.parse("package:" + ctx.packageName)
        val direct = android.content.Intent(
            android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            pkgUri
        ).apply { flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK }
        try {
            ctx.startActivity(direct)
            return true
        } catch (e: Exception) {
            android.util.Log.w(NAME, "ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS unavailable, falling back", e)
        }
        return try {
            val fallback = android.content.Intent(
                android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
            )
            fallback.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            ctx.startActivity(fallback)
            true
        } catch (e: Exception) {
            android.util.Log.e(NAME, "openBatteryOptimizationSettings failed", e)
            false
        }
    }

    override fun getFoldersRoot(): String {
        return try {
            mobileAPI.getFoldersRoot() ?: ""
        } catch (e: Exception) {
            ""
        }
    }

    override fun setFoldersRoot(path: String): Boolean {
        return try {
            mobileAPI.setFoldersRoot(path)
        } catch (e: Exception) {
            android.util.Log.e(NAME, "setFoldersRoot failed", e)
            false
        }
    }

    override fun maybeNotifyFolderErrors(
        folderId: String,
        count: Double,
        label: String,
        sampleError: String,
    ): Boolean {
        return NotificationDedup.maybeNotifyFolderErrors(
            ctx,
            folderId,
            count.toInt(),
            label,
            sampleError,
        )
    }

    override fun pickExternalFolder(): String {
        // Launch the system SAF folder picker synchronously from the JS thread.
        // We use SAFPickerHelper which is registered on the Activity and blocks
        // until the user picks a folder or cancels. Returns JSON describing
        // the picked folder, matching iOS's UIDocumentPicker shape.
        val activity = ctx.currentActivity as? MainActivity
            ?: return ""
        val uri = activity.pickSafFolderBlocking() ?: return ""
        // Take persistable read+write permission so the URI survives app restarts.
        val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        ctx.contentResolver.takePersistableUriPermission(uri, flags)
        val uriString = uri.toString()
        val displayName = try {
            safProvider.getDisplayName(uriString)
        } catch (e: Exception) {
            uriString
        }
        return org.json.JSONObject().apply {
            put("ok", true)
            put("id", uriString)
            put("path", uriString)
            put("displayName", displayName)
            put("isUbiquitous", false)
        }.toString()
    }

    override fun getPersistedExternalFolders(): String {
        return try {
            val perms = ctx.contentResolver.persistedUriPermissions
            val arr = org.json.JSONArray()
            for (p in perms) {
                val uriString = p.uri.toString()
                val displayName = try {
                    safProvider.getDisplayName(uriString)
                } catch (e: Exception) {
                    uriString
                }
                val obj = org.json.JSONObject().apply {
                    put("id", uriString)
                    put("path", uriString)
                    put("displayName", displayName)
                    // Android's permission model doesn't surface "stale" the way
                    // iOS bookmarks do; revoked permissions just disappear from
                    // persistedUriPermissions, so anything in the list is live.
                    put("isStale", false)
                }
                arr.put(obj)
            }
            arr.toString()
        } catch (e: Exception) {
            "[]"
        }
    }

    override fun revokeExternalFolder(path: String): Boolean {
        return try {
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            ctx.contentResolver.releasePersistableUriPermission(Uri.parse(path), flags)
            true
        } catch (e: Exception) {
            android.util.Log.e(NAME, "revokeExternalFolder failed", e)
            false
        }
    }

    override fun getExternalFolderDisplayName(path: String): String {
        return try {
            safProvider.getDisplayName(path)
        } catch (e: Exception) {
            android.util.Log.e(NAME, "getExternalFolderDisplayName failed", e)
            path
        }
    }

    override fun copySafFileToCache(treeURI: String, relativePath: String): String {
        return try {
            val treeUri = android.net.Uri.parse(treeURI)
            // Resolve the document ID and build the document URI
            val fd = safProvider.openFd(treeURI, relativePath, "r")
            val input = java.io.FileInputStream(java.io.FileDescriptor().also {
                // Use ParcelFileDescriptor to wrap the fd for proper stream creation
            })
            // Simpler: re-open through the provider to get an InputStream
            val pfd = android.os.ParcelFileDescriptor.adoptFd(fd.toInt())
            val inputStream = java.io.FileInputStream(pfd.fileDescriptor)

            // Write to cache dir preserving the filename
            val fileName = relativePath.substringAfterLast('/')
            val cacheFile = java.io.File(ctx.cacheDir, "saf-preview/$fileName")
            cacheFile.parentFile?.mkdirs()
            cacheFile.outputStream().use { out ->
                inputStream.use { inp -> inp.copyTo(out) }
            }
            pfd.close()
            cacheFile.absolutePath
        } catch (e: Exception) {
            android.util.Log.e(NAME, "copySafFileToCache failed", e)
            ""
        }
    }

    override fun validateExternalFolder(path: String): Boolean {
        return try {
            mobileAPI.validateSAFPermission(path)
        } catch (e: Exception) {
            android.util.Log.e(NAME, "validateExternalFolder failed", e)
            false
        }
    }

    override fun previewFileNative(pathsJson: String, startIndex: Double) {
        // No-op on Android; the JS-side FilePreviewModal handles preview.
        // Spec is shared cross-platform so we accept the call but ignore it.
    }

    override fun openFolderInFileManager(path: String): Boolean {
        // "primary:" in DocumentsUI maps to /storage/emulated/0, so a
        // tree URI under the app-scoped path resolves fine.
        return try {
            val externalRoot = android.os.Environment.getExternalStorageDirectory().absolutePath
            if (!path.startsWith(externalRoot)) {
                android.util.Log.w(NAME, "openFolderInFileManager: path not under external root: $path")
                return false
            }
            val relative = path.removePrefix(externalRoot).removePrefix("/")
            val docId = "primary:$relative"
            val treeUri = android.provider.DocumentsContract.buildTreeDocumentUri(
                "com.android.externalstorage.documents",
                docId,
            )
            // some file managers / OEM DocumentsUI handle ACTION_VIEW on a tree URI.
            val viewIntent = android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                setDataAndType(treeUri, "vnd.android.document/directory")
                addFlags(
                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        android.content.Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                        android.content.Intent.FLAG_ACTIVITY_NEW_TASK,
                )
            }
            try {
                ctx.startActivity(viewIntent)
                return true
            } catch (e: android.content.ActivityNotFoundException) {
                android.util.Log.w(NAME, "ACTION_VIEW for directory not handled, falling back to OPEN_DOCUMENT_TREE", e)
            }
            // fallback is a picker, not a viewer, but it's universally available.
            val pickerIntent = android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                putExtra(android.provider.DocumentsContract.EXTRA_INITIAL_URI, treeUri)
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            ctx.startActivity(pickerIntent)
            true
        } catch (e: Exception) {
            android.util.Log.e(NAME, "openFolderInFileManager failed", e)
            false
        }
    }
}

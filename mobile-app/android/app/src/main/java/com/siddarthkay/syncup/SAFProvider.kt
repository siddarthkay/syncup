package com.siddarthkay.syncup

import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.util.LruCache
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * Implements gobridge.SAFBridge so the Go-side SAF filesystem can delegate
 * file operations through Android's ContentResolver / DocumentsContract APIs.
 *
 * Data I/O is fd-based: [openFd] returns a raw file descriptor that Go wraps
 * in os.NewFile(), so read/write throughput bypasses JNI entirely.
 */
class SAFProvider(private val ctx: Context) : gobridge.SAFBridge {

    // Cache: "treeURI\nrelativePath" -> documentId
    private val docIdCache = LruCache<String, String>(2048)

    // Watch tracking
    private val nextWatchId = AtomicLong(1)
    private val watches = ConcurrentHashMap<Long, WatchEntry>()
    private val mainHandler = Handler(Looper.getMainLooper())

    private class WatchEntry(
        val treeURI: String,
        val observer: ContentObserver,
        val events: LinkedBlockingQueue<JSONObject> = LinkedBlockingQueue(4096),
    )

    // ---- StatJSON ----

    override fun statJSON(treeURI: String, relativePath: String): String {
        val treeUri = Uri.parse(treeURI)
        val docId = resolveDocumentId(treeUri, relativePath)
            ?: return JSONObject().put("exists", false).toString()

        val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
        )
        val cursor = ctx.contentResolver.query(docUri, projection, null, null, null)
            ?: return JSONObject().put("exists", false).toString()

        cursor.use {
            if (!it.moveToFirst()) return JSONObject().put("exists", false).toString()
            val name = it.getString(0) ?: ""
            val size = if (it.isNull(1)) 0L else it.getLong(1)
            val modTimeMs = if (it.isNull(2)) 0L else it.getLong(2)
            val mimeType = it.getString(3) ?: ""
            val isDir = mimeType == DocumentsContract.Document.MIME_TYPE_DIR
            return JSONObject()
                .put("name", name)
                .put("size", size)
                .put("modTimeMs", modTimeMs)
                .put("isDir", isDir)
                .put("exists", true)
                .toString()
        }
    }

    // ---- ListChildrenJSON ----

    override fun listChildrenJSON(treeURI: String, relativePath: String): String {
        val treeUri = Uri.parse(treeURI)
        val parentDocId = resolveDocumentId(treeUri, relativePath)
            ?: throw Exception("directory not found: $relativePath")

        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
        )
        val cursor = ctx.contentResolver.query(childrenUri, projection, null, null, null)
            ?: return "[]"

        val arr = JSONArray()
        cursor.use {
            while (it.moveToNext()) {
                val name = it.getString(0) ?: continue
                val size = if (it.isNull(1)) 0L else it.getLong(1)
                val modTimeMs = if (it.isNull(2)) 0L else it.getLong(2)
                val mimeType = it.getString(3) ?: ""
                val isDir = mimeType == DocumentsContract.Document.MIME_TYPE_DIR
                arr.put(
                    JSONObject()
                        .put("name", name)
                        .put("size", size)
                        .put("modTimeMs", modTimeMs)
                        .put("isDir", isDir)
                )
            }
        }
        return arr.toString()
    }

    // ---- OpenFd ----

    override fun openFd(treeURI: String, relativePath: String, mode: String): Long {
        val treeUri = Uri.parse(treeURI)
        val docId = resolveDocumentId(treeUri, relativePath)
            ?: throw Exception("file not found: $relativePath")
        val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)

        val safMode = when (mode) {
            "r"  -> "r"
            "w"  -> "w"
            "rw" -> "rw"
            "wt" -> "wt"
            else -> "r"
        }
        val pfd: ParcelFileDescriptor = ctx.contentResolver.openFileDescriptor(docUri, safMode)
            ?: throw Exception("openFileDescriptor returned null for $relativePath mode=$mode")
        // detachFd transfers ownership to the caller (Go); the ParcelFileDescriptor
        // can be GC'd without closing the fd.
        return pfd.detachFd().toLong()
    }

    // ---- CreateFile ----

    override fun createFile(
        treeURI: String,
        parentRelPath: String,
        name: String,
        mimeType: String,
    ): String {
        val treeUri = Uri.parse(treeURI)
        val parentDocId = resolveDocumentId(treeUri, parentRelPath)
            ?: throw Exception("parent directory not found: $parentRelPath")
        val parentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, parentDocId)
        val newUri = DocumentsContract.createDocument(ctx.contentResolver, parentUri, mimeType, name)
            ?: throw Exception("createDocument failed for $name in $parentRelPath")
        val newDocId = DocumentsContract.getDocumentId(newUri)
        val relPath = if (parentRelPath.isEmpty()) name else "$parentRelPath/$name"
        cacheDocId(treeURI, relPath, newDocId)
        return relPath
    }

    // ---- CreateDir ----

    override fun createDir(treeURI: String, parentRelPath: String, name: String): String {
        return createFile(treeURI, parentRelPath, name, DocumentsContract.Document.MIME_TYPE_DIR)
    }

    // ---- Delete ----

    override fun delete(treeURI: String, relativePath: String) {
        val treeUri = Uri.parse(treeURI)
        val docId = resolveDocumentId(treeUri, relativePath)
            ?: throw Exception("not found: $relativePath")
        val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
        if (!DocumentsContract.deleteDocument(ctx.contentResolver, docUri)) {
            throw Exception("deleteDocument failed for $relativePath")
        }
        invalidateCache(treeURI, relativePath)
    }

    // ---- Rename ----

    override fun rename(treeURI: String, oldRelPath: String, newRelPath: String) {
        val treeUri = Uri.parse(treeURI)
        val oldDocId = resolveDocumentId(treeUri, oldRelPath)
            ?: throw Exception("source not found: $oldRelPath")

        val oldName = oldRelPath.substringAfterLast('/')
        val newName = newRelPath.substringAfterLast('/')
        val oldParent = oldRelPath.substringBeforeLast('/', "")
        val newParent = newRelPath.substringBeforeLast('/', "")

        var docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, oldDocId)

        // rename if the filename changed
        if (oldName != newName) {
            val renamedUri = DocumentsContract.renameDocument(ctx.contentResolver, docUri, newName)
            if (renamedUri != null) {
                docUri = renamedUri
            }
        }

        // move if the parent directory changed (API 24+)
        if (oldParent != newParent && android.os.Build.VERSION.SDK_INT >= 24) {
            val oldParentDocId = resolveDocumentId(treeUri, oldParent)
                ?: throw Exception("old parent not found: $oldParent")
            val newParentDocId = resolveDocumentId(treeUri, newParent)
                ?: throw Exception("new parent not found: $newParent")
            val oldParentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, oldParentDocId)
            val newParentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, newParentDocId)
            DocumentsContract.moveDocument(ctx.contentResolver, docUri, oldParentUri, newParentUri)
        }

        invalidateCache(treeURI, oldRelPath)
        // re-resolve new path to refresh cache
        resolveDocumentId(treeUri, newRelPath)
    }

    // ---- SetLastModified ----

    override fun setLastModified(treeURI: String, relativePath: String, mtimeMs: Long) {
        // SAF's COLUMN_LAST_MODIFIED is read-only on most providers.
        // Best-effort: swallow failures.
    }

    // ---- UsageJSON ----

    override fun usageJSON(treeURI: String): String {
        // StatFs doesn't work on content:// URIs. Return zeros and let syncthing
        // fall back to its default disk-full check.
        return JSONObject().put("Free", 0L).put("Total", 0L).toString()
    }

    // ---- WalkJSON ----

    override fun walkJSON(treeURI: String, relativePath: String): String {
        val treeUri = Uri.parse(treeURI)
        val rootDocId = resolveDocumentId(treeUri, relativePath)
            ?: throw Exception("directory not found: $relativePath")

        val arr = JSONArray()
        walkRecursive(treeUri, rootDocId, relativePath, arr)
        return arr.toString()
    }

    private fun walkRecursive(
        treeUri: Uri,
        parentDocId: String,
        parentRelPath: String,
        out: JSONArray,
    ) {
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
        )
        val cursor = ctx.contentResolver.query(childrenUri, projection, null, null, null) ?: return
        cursor.use {
            while (it.moveToNext()) {
                val docId = it.getString(0) ?: continue
                val name = it.getString(1) ?: continue
                val size = if (it.isNull(2)) 0L else it.getLong(2)
                val modTimeMs = if (it.isNull(3)) 0L else it.getLong(3)
                val mimeType = it.getString(4) ?: ""
                val isDir = mimeType == DocumentsContract.Document.MIME_TYPE_DIR

                val relPath = if (parentRelPath.isEmpty()) name else "$parentRelPath/$name"
                cacheDocId(treeUri.toString(), relPath, docId)

                out.put(
                    JSONObject()
                        .put("name", relPath)
                        .put("size", size)
                        .put("modTimeMs", modTimeMs)
                        .put("isDir", isDir)
                )

                if (isDir) {
                    walkRecursive(treeUri, docId, relPath, out)
                }
            }
        }
    }

    // ---- GetDisplayName ----

    override fun getDisplayName(treeURI: String): String {
        val treeUri = Uri.parse(treeURI)
        val docId = DocumentsContract.getTreeDocumentId(treeUri)
        val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
        val projection = arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
        val cursor = ctx.contentResolver.query(docUri, projection, null, null, null)
            ?: return treeURI
        cursor.use {
            return if (it.moveToFirst()) it.getString(0) ?: treeURI else treeURI
        }
    }

    // ---- Document ID resolution ----

    /**
     * Resolve a relative POSIX path (e.g. "photos/2024/img.jpg") to a SAF
     * document ID by walking the tree from the root document.
     */
    private fun resolveDocumentId(treeUri: Uri, relativePath: String): String? {
        if (relativePath.isEmpty()) {
            return DocumentsContract.getTreeDocumentId(treeUri)
        }

        val cacheKey = "$treeUri\n$relativePath"
        docIdCache.get(cacheKey)?.let { return it }

        val parts = relativePath.split("/")
        var currentDocId = DocumentsContract.getTreeDocumentId(treeUri)

        for (part in parts) {
            if (part.isEmpty() || part == ".") continue
            val childDocId = findChildDocId(treeUri, currentDocId, part) ?: return null
            currentDocId = childDocId
        }

        docIdCache.put(cacheKey, currentDocId)
        return currentDocId
    }

    private fun findChildDocId(treeUri: Uri, parentDocId: String, childName: String): String? {
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        )
        val cursor = ctx.contentResolver.query(childrenUri, projection, null, null, null)
            ?: return null
        cursor.use {
            while (it.moveToNext()) {
                val name = it.getString(1)
                if (name == childName) {
                    return it.getString(0)
                }
            }
        }
        return null
    }

    private fun cacheDocId(treeURI: String, relativePath: String, docId: String) {
        docIdCache.put("$treeURI\n$relativePath", docId)
    }

    private fun invalidateCache(treeURI: String, relativePath: String) {
        docIdCache.remove("$treeURI\n$relativePath")
        // also invalidate children
        val prefix = "$treeURI\n$relativePath/"
        val snapshot = docIdCache.snapshot()
        for (key in snapshot.keys) {
            if (key.startsWith(prefix)) {
                docIdCache.remove(key)
            }
        }
    }

    // ---- RegisterWatch ----

    override fun registerWatch(treeURI: String): Long {
        val id = nextWatchId.getAndIncrement()
        val treeUri = Uri.parse(treeURI)
        val docId = DocumentsContract.getTreeDocumentId(treeUri)
        val watchUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, docId)

        val entry = WatchEntry(treeURI, object : ContentObserver(mainHandler) {
            override fun onChange(selfChange: Boolean) {
                onChange(selfChange, null)
            }
            override fun onChange(selfChange: Boolean, uri: Uri?) {
                // ContentObserver typically gives coarse notifications.
                // We emit a NonRemove event for the root so syncthing triggers a rescan.
                val event = JSONObject()
                    .put("type", "nonremove")
                    .put("path", ".")
                entry?.events?.offer(event)
            }

            private val entry get() = watches[id]
        })

        watches[id] = entry
        ctx.contentResolver.registerContentObserver(watchUri, true, entry.observer)
        return id
    }

    // ---- UnregisterWatch ----

    override fun unregisterWatch(watchID: Long) {
        val entry = watches.remove(watchID) ?: return
        ctx.contentResolver.unregisterContentObserver(entry.observer)
    }

    // ---- PollWatchEventsJSON ----

    override fun pollWatchEventsJSON(watchID: Long, timeoutMs: Long): String {
        val entry = watches[watchID]
            ?: throw Exception("unknown watch ID: $watchID")

        val arr = JSONArray()
        // Block for up to timeoutMs waiting for the first event
        val first = entry.events.poll(timeoutMs, TimeUnit.MILLISECONDS)
        if (first != null) {
            arr.put(first)
            // Drain any additional events that arrived
            val batch = mutableListOf<JSONObject>()
            entry.events.drainTo(batch, 100)
            for (ev in batch) arr.put(ev)
        }
        return arr.toString()
    }

    // ---- StatBatchJSON ----

    override fun statBatchJSON(treeURI: String, pathsJSON: String): String {
        val paths = JSONArray(pathsJSON)
        val results = JSONArray()
        for (i in 0 until paths.length()) {
            val relPath = paths.getString(i)
            val stat = statJSON(treeURI, relPath)
            results.put(JSONObject(stat))
        }
        return results.toString()
    }

    // ---- ValidatePermission ----

    override fun validatePermission(treeURI: String): Boolean {
        val targetUri = Uri.parse(treeURI)
        val perms = ctx.contentResolver.persistedUriPermissions
        for (p in perms) {
            if (p.uri == targetUri && p.isReadPermission && p.isWritePermission) {
                return true
            }
        }
        return false
    }
}

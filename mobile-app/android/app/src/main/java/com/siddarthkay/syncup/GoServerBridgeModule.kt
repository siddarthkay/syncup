package com.siddarthkay.syncup

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

    override fun openBatteryOptimizationSettings(): Boolean {
        return try {
            val intent = android.content.Intent(
                android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
            )
            intent.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            ctx.startActivity(intent)
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

    override fun hasAllFilesAccess(): Boolean {
        return Paths.hasAllFilesAccess()
    }

    override fun requestAllFilesAccess(): Boolean {
        // pre-R: WRITE is install-time, nothing to ask for.
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.R) {
            return true
        }
        return try {
            val intent = android.content.Intent(
                android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                android.net.Uri.parse("package:${ctx.packageName}"),
            )
            intent.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            ctx.startActivity(intent)
            true
        } catch (e: Exception) {
            android.util.Log.e(NAME, "requestAllFilesAccess failed", e)
            // some OEMs don't ship the package-specific deeplink.
            try {
                val fallback = android.content.Intent(
                    android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION,
                )
                fallback.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                ctx.startActivity(fallback)
                true
            } catch (e2: Exception) {
                android.util.Log.e(NAME, "fallback ACTION_MANAGE_ALL_FILES failed", e2)
                false
            }
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

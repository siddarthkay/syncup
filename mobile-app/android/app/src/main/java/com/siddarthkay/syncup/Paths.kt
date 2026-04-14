package com.siddarthkay.syncup

import android.content.Context
import android.os.Build
import android.os.Environment
import java.io.File

// daemon state lives in app-scoped storage; user folders go public when we have the permission, scoped otherwise.
object Paths {
    fun syncthingDir(context: Context): String {
        val external = context.getExternalFilesDir(null)
        val base = external ?: context.filesDir
        val dir = File(base, "syncthing")
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir.absolutePath
    }

    fun foldersRoot(context: Context): String {
        val dir = if (hasAllFilesAccess()) {
            File(Environment.getExternalStorageDirectory(), "syncthing/folders")
        } else {
            File(syncthingDir(context), "folders")
        }
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir.absolutePath
    }

    fun hasAllFilesAccess(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            // pre-R: legacy WRITE_EXTERNAL_STORAGE is install-time.
            true
        }
    }
}

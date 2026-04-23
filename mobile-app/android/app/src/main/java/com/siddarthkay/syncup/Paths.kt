package com.siddarthkay.syncup

import android.content.Context
import java.io.File

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
        val dir = File(syncthingDir(context), "folders")
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir.absolutePath
    }
}

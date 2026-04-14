package com.siddarthkay.syncup

import android.content.Context
import android.util.Log
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory
import java.io.File
import java.io.FileInputStream

// reads config.xml off disk so the share sheet works before the daemon is up.
object ConfigParser {

    private const val TAG = "ConfigParser"

    data class FolderEntry(val id: String, val label: String, val path: String)

    data class ParsedConfig(
        val folders: List<FolderEntry>,
        val apiKey: String,
        val guiAddress: String,
    )

    fun parse(context: Context): ParsedConfig? {
        val configFile = File(Paths.syncthingDir(context), "config.xml")
        if (!configFile.exists()) {
            Log.w(TAG, "config.xml not found at ${configFile.absolutePath}")
            return null
        }
        return try {
            FileInputStream(configFile).use { input ->
                val parser = XmlPullParserFactory.newInstance().newPullParser()
                parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
                parser.setInput(input, "UTF-8")
                read(parser)
            }
        } catch (e: Exception) {
            Log.e(TAG, "parse failed", e)
            null
        }
    }

    private fun read(parser: XmlPullParser): ParsedConfig {
        val folders = mutableListOf<FolderEntry>()
        var apiKey = ""
        var guiAddress = ""

        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            if (event == XmlPullParser.START_TAG) {
                when (parser.name) {
                    "folder" -> {
                        val id = parser.getAttributeValue(null, "id") ?: ""
                        val label = parser.getAttributeValue(null, "label") ?: id
                        val path = parser.getAttributeValue(null, "path") ?: ""
                        if (id.isNotEmpty() && path.isNotEmpty()) {
                            folders.add(FolderEntry(id, label.ifEmpty { id }, path))
                        }
                    }
                    "gui" -> {
                        val pair = readGui(parser)
                        if (pair.first.isNotEmpty()) apiKey = pair.first
                        if (pair.second.isNotEmpty()) guiAddress = pair.second
                    }
                }
            }
            event = parser.next()
        }
        return ParsedConfig(folders, apiKey, guiAddress)
    }

    private fun readGui(parser: XmlPullParser): Pair<String, String> {
        var apiKey = ""
        var address = ""
        while (true) {
            val event = parser.next()
            if (event == XmlPullParser.END_DOCUMENT) break
            if (event == XmlPullParser.END_TAG && parser.name == "gui") break
            if (event == XmlPullParser.START_TAG) {
                when (parser.name) {
                    "apikey" -> apiKey = parser.nextText().orEmpty()
                    "address" -> address = parser.nextText().orEmpty()
                }
            }
        }
        return apiKey to address
    }
}

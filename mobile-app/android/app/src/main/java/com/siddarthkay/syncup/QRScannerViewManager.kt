package com.siddarthkay.syncup

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.events.RCTEventEmitter

class QRScannerViewManager(private val reactContext: ReactApplicationContext) :
    SimpleViewManager<QRScannerView>() {

    companion object {
        const val REACT_CLASS = "QRScannerView"
    }

    override fun getName(): String = REACT_CLASS

    override fun createViewInstance(context: ThemedReactContext): QRScannerView {
        val view = QRScannerView(context)
        view.onQRScanned = { data ->
            val event = Arguments.createMap().apply {
                putString("data", data)
            }
            reactContext
                .getJSModule(RCTEventEmitter::class.java)
                .receiveEvent(view.id, "onQRScanned", event)
        }
        return view
    }

    override fun onDropViewInstance(view: QRScannerView) {
        super.onDropViewInstance(view)
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> {
        return MapBuilder.of(
            "onQRScanned",
            MapBuilder.of("registrationName", "onQRScanned"),
        )
    }
}

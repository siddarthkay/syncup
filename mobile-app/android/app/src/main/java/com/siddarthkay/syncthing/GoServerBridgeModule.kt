package com.siddarthkay.syncthing

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

    override fun getName(): String = NAME

    override fun startServer(): Double {
        return try {
            mobileAPI.startServer().toDouble()
        } catch (e: Exception) {
            0.0
        }
    }

    override fun stopServer(): Boolean {
        return try {
            mobileAPI.stopServer()
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
}
package com.siddarthkay.syncup

import android.annotation.SuppressLint
import android.content.Context
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import java.util.concurrent.Executors

class QRScannerView(context: Context) : FrameLayout(context) {

    var onQRScanned: ((String) -> Unit)? = null

    private val previewView = PreviewView(context).also {
        it.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        it.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        addView(it)
    }

    // React Native suppresses requestLayout on native views, so child views
    // like PreviewView's TextureView never get measured. Force a layout pass.
    override fun requestLayout() {
        super.requestLayout()
        post {
            measure(
                MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
            )
            layout(left, top, right, bottom)
        }
    }

    private val executor = Executors.newSingleThreadExecutor()
    private var cameraProvider: ProcessCameraProvider? = null
    private var lastScanTime = 0L

    private val reader = MultiFormatReader().apply {
        setHints(mapOf(
            DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
            DecodeHintType.TRY_HARDER to true,
        ))
    }

    private fun getActivity(): AppCompatActivity {
        var ctx = context
        while (ctx is android.content.ContextWrapper) {
            if (ctx is AppCompatActivity) return ctx
            ctx = ctx.baseContext
        }
        throw IllegalStateException("QRScannerView must be hosted in an AppCompatActivity")
    }

    private fun setupCamera() {
        val activity = getActivity()
        val future = ProcessCameraProvider.getInstance(activity)
        future.addListener({
            cameraProvider = future.get()
            bindCamera()
        }, ContextCompat.getMainExecutor(activity))
    }

    private fun bindCamera() {
        val provider = cameraProvider ?: return
        val activity = getActivity()

        provider.unbindAll()

        val preview = Preview.Builder().build().also {
            it.surfaceProvider = previewView.surfaceProvider
        }

        val analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
            .also { it.setAnalyzer(executor, ::analyzeFrame) }

        provider.bindToLifecycle(
            activity,
            CameraSelector.DEFAULT_BACK_CAMERA,
            preview,
            analysis,
        )
    }

    @SuppressLint("UnsafeOptInUsageError")
    private fun analyzeFrame(image: ImageProxy) {
        try {
            val now = System.currentTimeMillis()
            if (now - lastScanTime < 1000) return

            val plane = image.planes[0]
            val bytes = ByteArray(plane.buffer.remaining())
            plane.buffer.get(bytes)

            val source = PlanarYUVLuminanceSource(
                bytes,
                image.width, image.height,
                0, 0,
                image.width, image.height,
                false,
            )
            val bitmap = BinaryBitmap(HybridBinarizer(source))
            val result = reader.decodeWithState(bitmap)

            lastScanTime = now
            post { onQRScanned?.invoke(result.text) }
        } catch (_: Exception) {
            // no QR code found in this frame
        } finally {
            reader.reset()
            image.close()
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        previewView.post { setupCamera() }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        cameraProvider?.unbindAll()
    }
}

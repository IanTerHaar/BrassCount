package com.brasscount.app.audio

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Process
import android.os.SystemClock
import com.facebook.fbreact.specs.NativeAudioCaptureSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * Low-level microphone capture service, bridged to JS as the `AudioCapture`
 * TurboModule. Reports live amplitude/dB readings via the
 * `AudioCapture:onAmplitude` device event and stream failures via
 * `AudioCapture:onError` — it does not interpret what a sound means, that
 * is the JS-side DrillRunEngine's job.
 *
 * Runtime permission is requested from JS (`PermissionsAndroid`); this
 * module only checks the current grant state before opening the mic.
 */
@ReactModule(name = AudioCaptureModule.NAME)
class AudioCaptureModule(private val reactContext: ReactApplicationContext) :
  NativeAudioCaptureSpec(reactContext) {

  private val isRunning = AtomicBoolean(false)
  private val stateLock = Any()
  private var audioRecord: AudioRecord? = null
  private var captureThread: Thread? = null

  override fun getName() = NAME

  override fun start(promise: Promise) {
    synchronized(stateLock) {
      if (isRunning.get()) {
        promise.resolve(null)
        return
      }

      if (reactContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
        PackageManager.PERMISSION_GRANTED
      ) {
        promise.reject("PERMISSION_DENIED", "RECORD_AUDIO permission has not been granted")
        return
      }

      val minBufferSize =
        AudioRecord.getMinBufferSize(SAMPLE_RATE_HZ, CHANNEL_CONFIG, AUDIO_FORMAT)
      if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
        promise.reject(
          "UNSUPPORTED_CONFIG",
          "Device does not support the requested audio configuration",
        )
        return
      }
      val bufferSizeBytes = maxOf(minBufferSize, FRAMES_PER_BUFFER * BYTES_PER_SAMPLE)

      val recorder =
        try {
          AudioRecord(
            MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE_HZ,
            CHANNEL_CONFIG,
            AUDIO_FORMAT,
            bufferSizeBytes,
          )
        } catch (e: SecurityException) {
          promise.reject("PERMISSION_DENIED", "RECORD_AUDIO permission has not been granted", e)
          return
        } catch (e: IllegalArgumentException) {
          promise.reject("UNSUPPORTED_CONFIG", e.message, e)
          return
        }

      if (recorder.state != AudioRecord.STATE_INITIALIZED) {
        recorder.release()
        promise.reject("INIT_FAILED", "AudioRecord failed to initialize")
        return
      }

      try {
        recorder.startRecording()
      } catch (e: IllegalStateException) {
        recorder.release()
        promise.reject("START_FAILED", "AudioRecord failed to start recording", e)
        return
      }
      if (recorder.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        recorder.release()
        promise.reject("START_FAILED", "AudioRecord failed to start recording")
        return
      }

      audioRecord = recorder
      isRunning.set(true)
      captureThread = thread(name = "BrassCount-AudioCapture") { readLoop(recorder) }
      promise.resolve(null)
    }
  }

  override fun stop(promise: Promise) {
    stopInternal()
    promise.resolve(null)
  }

  override fun isCapturing(): Boolean = isRunning.get()

  override fun invalidate() {
    stopInternal()
    super.invalidate()
  }

  // Android's global RCTDeviceEventEmitter needs no native-side listener
  // bookkeeping, but NativeEventEmitter requires both methods to exist.
  override fun addListener(eventName: String) {}

  override fun removeListeners(count: Double) {}

  private fun stopInternal() {
    val recorder: AudioRecord?
    val thread: Thread?
    synchronized(stateLock) {
      if (!isRunning.getAndSet(false)) {
        return
      }
      recorder = audioRecord
      thread = captureThread
      audioRecord = null
      captureThread = null
    }
    try {
      thread?.join(THREAD_JOIN_TIMEOUT_MS)
    } catch (e: InterruptedException) {
      Thread.currentThread().interrupt()
    }
    releaseRecorder(recorder)
  }

  private fun releaseRecorder(recorder: AudioRecord?) {
    recorder ?: return
    try {
      if (recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
        recorder.stop()
      }
    } catch (e: IllegalStateException) {
      // Already stopped; nothing to do.
    } finally {
      recorder.release()
    }
  }

  /** Runs on a dedicated thread until `isRunning` flips false or a read fails. */
  private fun readLoop(recorder: AudioRecord) {
    try {
      Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
    } catch (e: SecurityException) {
      // Best-effort; default thread priority still works.
    }

    val buffer = ShortArray(FRAMES_PER_BUFFER)
    while (isRunning.get()) {
      val framesRead =
        try {
          recorder.read(buffer, 0, buffer.size)
        } catch (e: IllegalStateException) {
          // stopInternal()'s join() timed out while this thread was still
          // blocked in read() and released the recorder underneath us.
          break
        }
      if (framesRead <= 0) {
        if (isRunning.get()) {
          emitError("Audio read failed with error code $framesRead")
        }
        break
      }
      emitAmplitude(computeReading(buffer, framesRead))
    }

    // The loop can exit on its own (read error) without stop() ever being
    // called from JS, so clear state here too rather than leaking the
    // AudioRecord or leaving isCapturing() reporting stale state.
    if (isRunning.getAndSet(false)) {
      synchronized(stateLock) {
        audioRecord = null
        captureThread = null
      }
      releaseRecorder(recorder)
    }
  }

  private fun computeReading(buffer: ShortArray, framesRead: Int): Reading {
    var sumOfSquares = 0.0
    for (i in 0 until framesRead) {
      val sample = buffer[i].toDouble()
      sumOfSquares += sample * sample
    }
    val rms = sqrt(sumOfSquares / framesRead)
    val amplitude = (rms / MAX_PCM_16_AMPLITUDE).coerceIn(0.0, 1.0)
    val db =
      if (rms > 0) {
        (20.0 * log10(rms / MAX_PCM_16_AMPLITUDE)).coerceIn(MIN_DB, 0.0)
      } else {
        MIN_DB
      }
    return Reading(amplitude, db, SystemClock.elapsedRealtime())
  }

  private fun emitAmplitude(reading: Reading) {
    val payload =
      Arguments.createMap().apply {
        putDouble("amplitude", reading.amplitude)
        putDouble("db", reading.db)
        putDouble("timestamp", reading.timestamp.toDouble())
      }
    reactContext.emitDeviceEvent(EVENT_AMPLITUDE, payload)
  }

  private fun emitError(message: String) {
    val payload = Arguments.createMap().apply { putString("message", message) }
    reactContext.emitDeviceEvent(EVENT_ERROR, payload)
  }

  private data class Reading(val amplitude: Double, val db: Double, val timestamp: Long)

  companion object {
    const val NAME = "AudioCapture"
    const val EVENT_AMPLITUDE = "AudioCapture:onAmplitude"
    const val EVENT_ERROR = "AudioCapture:onError"

    private const val SAMPLE_RATE_HZ = 44100
    private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
    private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    private const val BYTES_PER_SAMPLE = 2
    private const val FRAMES_PER_BUFFER = 1024
    private const val MAX_PCM_16_AMPLITUDE = 32768.0
    private const val MIN_DB = -160.0
    private const val THREAD_JOIN_TIMEOUT_MS = 500L
  }
}

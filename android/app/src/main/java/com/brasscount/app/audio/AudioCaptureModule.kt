package com.brasscount.app.audio

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Process
import android.os.SystemClock
import com.facebook.fbreact.specs.NativeAudioCaptureSpec
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.common.LifecycleState
import com.facebook.react.module.annotations.ReactModule
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Low-level microphone capture service, bridged to JS as the `AudioCapture`
 * TurboModule. Reports live amplitude/dB readings via the
 * `AudioCapture:onAmplitude` device event and stream failures via
 * `AudioCapture:onError` — it does not interpret what a sound means, that
 * is the JS-side DrillRunEngine's job.
 *
 * Runtime permission is requested from JS (`PermissionsAndroid`); this
 * module only checks the current grant state before opening the mic.
 *
 * Capture is foreground-only: it is stopped when the host activity pauses
 * (JS is told through an `INTERRUPTED` error event) so the microphone is
 * never left open behind the user's back. JS restarts it on resume.
 */
@ReactModule(name = AudioCaptureModule.NAME)
class AudioCaptureModule(private val reactContext: ReactApplicationContext) :
  NativeAudioCaptureSpec(reactContext), LifecycleEventListener {

  private val isRunning = AtomicBoolean(false)
  private val stateLock = Any()
  // Written under stateLock; read lock-free by the capture thread to notice
  // that it has been superseded.
  @Volatile private var audioRecord: AudioRecord? = null
  private var captureThread: Thread? = null

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName() = NAME

  override fun start(promise: Promise) {
    synchronized(stateLock) {
      if (isRunning.get()) {
        promise.resolve(null)
        return
      }

      // Checked under stateLock: onHostPause's stop takes the same lock, so
      // a start that slips in just before a pause is still stopped by it.
      if (reactContext.lifecycleState != LifecycleState.RESUMED) {
        promise.reject(
          "NOT_IN_FOREGROUND",
          "Audio capture can only start while the app is in the foreground",
        )
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
      val bufferSizeBytes = captureBufferSizeBytes(minBufferSize)

      // A source can fail at either step — refusing to open, or opening and
      // then refusing to record — so each one is taken all the way to
      // recording before falling back to the next.
      var anySourceOpened = false
      val recorder =
        try {
          audioSourceIdsByPreference().firstNotNullOfOrNull { source ->
            openRecorder(source, bufferSizeBytes)?.let { opened ->
              anySourceOpened = true
              startRecorder(opened)
            }
          }
        } catch (e: SecurityException) {
          promise.reject("PERMISSION_DENIED", "RECORD_AUDIO permission has not been granted", e)
          return
        }
      if (recorder == null) {
        if (anySourceOpened) {
          promise.reject("START_FAILED", "AudioRecord failed to start recording")
        } else {
          promise.reject("INIT_FAILED", "AudioRecord failed to initialize")
        }
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
    reactContext.removeLifecycleEventListener(this)
    stopInternal()
    super.invalidate()
  }

  override fun onHostResume() {}

  override fun onHostPause() {
    if (stopInternal()) {
      emitError(CODE_INTERRUPTED, "Audio capture stopped because the app left the foreground")
    }
  }

  override fun onHostDestroy() {
    stopInternal()
  }

  // Android's global RCTDeviceEventEmitter needs no native-side listener
  // bookkeeping, but NativeEventEmitter requires both methods to exist.
  override fun addListener(eventName: String) {}

  override fun removeListeners(count: Double) {}

  /**
   * MediaRecorder.AudioSource ids to try, best first. The order itself is
   * decided by [audioSourcesByPreference]; this only asks the device whether
   * it has an unprocessed path and maps the result to platform constants.
   */
  private fun audioSourceIdsByPreference(): List<Int> {
    val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    val supportsUnprocessed =
      audioManager?.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED) == "true"
    return audioSourcesByPreference(supportsUnprocessed).map { kind ->
      when (kind) {
        AudioSourceKind.UNPROCESSED -> MediaRecorder.AudioSource.UNPROCESSED
        AudioSourceKind.VOICE_RECOGNITION -> MediaRecorder.AudioSource.VOICE_RECOGNITION
        AudioSourceKind.MIC -> MediaRecorder.AudioSource.MIC
      }
    }
  }

  /**
   * Opens an initialized recorder on [source], or returns null when the
   * device cannot provide one — some report a source as supported and then
   * fail to open it. A missing permission still throws SecurityException.
   */
  private fun openRecorder(source: Int, bufferSizeBytes: Int): AudioRecord? {
    val recorder =
      try {
        AudioRecord(source, SAMPLE_RATE_HZ, CHANNEL_CONFIG, AUDIO_FORMAT, bufferSizeBytes)
      } catch (e: IllegalArgumentException) {
        return null
      }
    if (recorder.state != AudioRecord.STATE_INITIALIZED) {
      recorder.release()
      return null
    }
    return recorder
  }

  /**
   * Starts [recorder] recording and returns it, or releases it and returns
   * null when the device will not record from that source.
   */
  private fun startRecorder(recorder: AudioRecord): AudioRecord? {
    val isRecording =
      try {
        recorder.startRecording()
        recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING
      } catch (e: IllegalStateException) {
        false
      }
    if (!isRecording) {
      recorder.release()
      return null
    }
    return recorder
  }

  /** Stops capture if it is running. Returns whether it was. */
  private fun stopInternal(): Boolean {
    val recorder: AudioRecord?
    val thread: Thread?
    synchronized(stateLock) {
      if (!isRunning.getAndSet(false)) {
        return false
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
    return true
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

  /**
   * Runs on a dedicated thread until capture is stopped, this recorder is
   * superseded by a newer start(), or a read fails.
   */
  private fun readLoop(recorder: AudioRecord) {
    try {
      Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
    } catch (e: SecurityException) {
      // Best-effort; default thread priority still works.
    }

    val buffer = ShortArray(FRAMES_PER_BUFFER)
    while (isRunning.get() && audioRecord === recorder) {
      val framesRead =
        try {
          recorder.read(buffer, 0, buffer.size)
        } catch (e: IllegalStateException) {
          // stopInternal()'s join() timed out while this thread was still
          // blocked in read() and released the recorder underneath us.
          break
        }
      // Taken as soon as the blocking read returns, so it marks the capture
      // time of the buffer's last frame.
      val readEndNanos = SystemClock.elapsedRealtimeNanos()
      if (framesRead <= 0) {
        if (isRunning.get() && audioRecord === recorder) {
          emitError(CODE_READ_FAILED, "Audio read failed with error code $framesRead")
        }
        break
      }
      emitAmplitude(computeReading(buffer, framesRead, readEndNanos))
    }

    // The loop can exit on its own (read error) without stop() ever being
    // called from JS, so clear state here too rather than leaking the
    // AudioRecord or leaving isCapturing() reporting stale state. Only do so
    // while this recorder is still the current one: if stop() already took
    // it (and a later start() may have installed another), that state is no
    // longer ours to clear.
    val stillCurrent =
      synchronized(stateLock) {
        if (audioRecord === recorder) {
          isRunning.set(false)
          audioRecord = null
          captureThread = null
          true
        } else {
          false
        }
      }
    if (stillCurrent) {
      releaseRecorder(recorder)
    }
  }

  private fun emitAmplitude(reading: Reading) {
    val payload =
      Arguments.createMap().apply {
        putDouble("amplitude", reading.amplitude)
        putDouble("db", reading.db)
        putDouble("peak", reading.peak)
        putDouble("peakDb", reading.peakDb)
        putDouble("timestamp", reading.timestampMs)
        putDouble("peakTimestamp", reading.peakTimestampMs)
      }
    emitToJs(EVENT_AMPLITUDE, payload)
  }

  private fun emitError(code: String, message: String) {
    val payload =
      Arguments.createMap().apply {
        putString("code", code)
        putString("message", message)
      }
    emitToJs(EVENT_ERROR, payload)
  }

  // The capture thread can still be mid-iteration while JS reloads or tears
  // down; emitting then would throw on a thread with no handler.
  private fun emitToJs(eventName: String, payload: WritableMap) {
    if (reactContext.hasActiveReactInstance()) {
      reactContext.emitDeviceEvent(eventName, payload)
    }
  }

  companion object {
    const val NAME = "AudioCapture"
    const val EVENT_AMPLITUDE = "AudioCapture:onAmplitude"
    const val EVENT_ERROR = "AudioCapture:onError"

    // Error-event codes; mirrored by AudioCaptureErrorCode in src/types/audio.ts.
    private const val CODE_READ_FAILED = "READ_FAILED"
    private const val CODE_INTERRUPTED = "INTERRUPTED"

    // The sample rate, buffer length and level constants live in
    // AudioLevels.kt, next to the maths that depends on them.
    private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
    private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    private const val THREAD_JOIN_TIMEOUT_MS = 500L
  }
}

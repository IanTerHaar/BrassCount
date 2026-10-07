package com.brasscount.app.audio

/**
 * The microphone inputs the capture module knows how to open. Kept free of
 * android.media so the preference order below is unit-testable on the JVM;
 * AudioCaptureModule maps each entry to its MediaRecorder.AudioSource id.
 */
internal enum class AudioSourceKind {
  UNPROCESSED,
  VOICE_RECOGNITION,
  MIC,
}

/**
 * Audio sources to try, best first. The unprocessed source reflects real
 * sound pressure; the default MIC source may run automatic gain control
 * and noise suppression, which would flatten the level differences
 * calibration relies on. VOICE_RECOGNITION is usually tuned with less of
 * that processing than MIC, though vendors differ, so readings on devices
 * without an unprocessed path may still be shaped. MIC stays last so a
 * device that rejects the others can still capture.
 */
internal fun audioSourcesByPreference(supportsUnprocessed: Boolean): List<AudioSourceKind> {
  val fallbacks = listOf(AudioSourceKind.VOICE_RECOGNITION, AudioSourceKind.MIC)
  return if (supportsUnprocessed) {
    listOf(AudioSourceKind.UNPROCESSED) + fallbacks
  } else {
    fallbacks
  }
}

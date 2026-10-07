package com.brasscount.app.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class AudioSourcePreferenceTest {

  @Test
  fun `unprocessed is tried first when the device supports it`() {
    val sources = audioSourcesByPreference(supportsUnprocessed = true)

    assertEquals(
      listOf(
        AudioSourceKind.UNPROCESSED,
        AudioSourceKind.VOICE_RECOGNITION,
        AudioSourceKind.MIC,
      ),
      sources,
    )
  }

  @Test
  fun `unprocessed is not tried when the device does not support it`() {
    val sources = audioSourcesByPreference(supportsUnprocessed = false)

    assertFalse(sources.contains(AudioSourceKind.UNPROCESSED))
    assertEquals(listOf(AudioSourceKind.VOICE_RECOGNITION, AudioSourceKind.MIC), sources)
  }

  @Test
  fun `mic is always the last resort`() {
    val withUnprocessed = audioSourcesByPreference(supportsUnprocessed = true)
    val withoutUnprocessed = audioSourcesByPreference(supportsUnprocessed = false)

    assertEquals(AudioSourceKind.MIC, withUnprocessed.last())
    assertEquals(AudioSourceKind.MIC, withoutUnprocessed.last())
  }

  @Test
  fun `no source is tried twice`() {
    val withUnprocessed = audioSourcesByPreference(supportsUnprocessed = true)
    val withoutUnprocessed = audioSourcesByPreference(supportsUnprocessed = false)

    assertEquals(withUnprocessed.size, withUnprocessed.toSet().size)
    assertEquals(withoutUnprocessed.size, withoutUnprocessed.toSet().size)
  }
}

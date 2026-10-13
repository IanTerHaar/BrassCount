package com.brasscount.app.audio

import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioLevelsTest {

  // --- levels ---

  @Test
  fun `silence reports zero amplitude and the dB floor`() {
    val buffer = ShortArray(FULL_BUFFER_FRAMES)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    assertEquals(0.0, reading.amplitude, 0.0)
    assertEquals(0.0, reading.peak, 0.0)
    assertEquals(-160.0, reading.db, 0.0)
    assertEquals(-160.0, reading.peakDb, 0.0)
  }

  @Test
  fun `negative full scale reports exactly amplitude 1 and 0 dB`() {
    val buffer = ShortArray(FULL_BUFFER_FRAMES) { Short.MIN_VALUE }

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    assertEquals(1.0, reading.amplitude, 0.0)
    assertEquals(0.0, reading.db, 0.0)
    assertEquals(1.0, reading.peak, 0.0)
    assertEquals(0.0, reading.peakDb, 0.0)
  }

  @Test
  fun `positive full scale reports just under amplitude 1 and just under 0 dB`() {
    val buffer = ShortArray(FULL_BUFFER_FRAMES) { Short.MAX_VALUE }

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    // 32767 / 32768, and 20 * log10 of that.
    assertEquals(0.999969482421875, reading.amplitude, LEVEL_DELTA)
    assertEquals(-0.000265076, reading.db, DB_DELTA)
    assertEquals(0.999969482421875, reading.peak, LEVEL_DELTA)
    assertEquals(-0.000265076, reading.peakDb, DB_DELTA)
  }

  @Test
  fun `a single most-negative sample is a full-scale peak without overflowing`() {
    val buffer = shortArrayOf(0, Short.MIN_VALUE, 0, 0)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    assertEquals(1.0, reading.peak, 0.0)
    assertEquals(0.0, reading.peakDb, 0.0)
    // RMS of one 32768 sample in four frames is 16384: half scale.
    assertEquals(0.5, reading.amplitude, LEVEL_DELTA)
  }

  @Test
  fun `a constant half-scale buffer reports amplitude one half and about minus 6 dB`() {
    val buffer = ShortArray(FULL_BUFFER_FRAMES) { 16384 }

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    // 20 * log10(0.5) = -6.0206
    assertEquals(0.5, reading.amplitude, LEVEL_DELTA)
    assertEquals(-6.020599913, reading.db, DB_DELTA)
    assertEquals(0.5, reading.peak, LEVEL_DELTA)
    assertEquals(-6.020599913, reading.peakDb, DB_DELTA)
  }

  @Test
  fun `a mixed buffer reports its RMS level separately from its peak`() {
    // Squares: 9e6 + 16e6 + 0 + 0 = 25e6; mean 6.25e6; RMS 2500.
    val buffer = shortArrayOf(3000, -4000, 0, 0)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    // 2500 / 32768 and 20 * log10 of it; 4000 / 32768 and 20 * log10 of it.
    assertEquals(0.0762939453125, reading.amplitude, LEVEL_DELTA)
    assertEquals(-22.350198526, reading.db, DB_DELTA)
    assertEquals(0.1220703125, reading.peak, LEVEL_DELTA)
    assertEquals(-18.267798872, reading.peakDb, DB_DELTA)
  }

  @Test
  fun `a half-on half-off buffer is 3 dB below its constant-level equivalent`() {
    // RMS = 16384 / sqrt(2).
    val buffer = shortArrayOf(16384, -16384, 0, 0)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    assertEquals(0.353553391, reading.amplitude, LEVEL_DELTA)
    assertEquals(-9.030899870, reading.db, DB_DELTA)
    assertEquals(0.5, reading.peak, LEVEL_DELTA)
    assertEquals(-6.020599913, reading.peakDb, DB_DELTA)
  }

  @Test
  fun `samples past framesRead are ignored`() {
    // Four quiet frames were read; the rest is a loud leftover from an earlier read.
    val buffer = shortArrayOf(100, 100, 100, 100, Short.MAX_VALUE, Short.MIN_VALUE, 20000, 20000)

    val reading = computeReading(buffer, 4, END_NANOS)

    // 100 / 32768
    assertEquals(0.0030517578125, reading.amplitude, LEVEL_DELTA)
    assertEquals(0.0030517578125, reading.peak, LEVEL_DELTA)
  }

  @Test
  fun `peak timing counts back from the last frame read, not the end of the array`() {
    val buffer = shortArrayOf(100, 0, 0, 0, Short.MAX_VALUE, Short.MAX_VALUE, 0, 0)

    val reading = computeReading(buffer, 4, END_NANOS)

    // Peak is frame 0 of 4 read: 3 frames (68 027 ns) before the read ended.
    assertEquals(END_MS - 0.068027, reading.peakTimestampMs, TIME_DELTA_MS)
  }

  // --- peak location ---

  @Test
  fun `a peak in the last frame is timed at the buffer end`() {
    val buffer = ShortArray(FULL_BUFFER_FRAMES).also { it[1023] = 12000 }

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    assertEquals(END_MS, reading.timestampMs, 0.0)
    assertEquals(reading.timestampMs, reading.peakTimestampMs, 0.0)
  }

  @Test
  fun `a peak in the first frame of a full buffer is timed 1023 frames earlier`() {
    val buffer = ShortArray(FULL_BUFFER_FRAMES).also { it[0] = 12000 }

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    // 1023 frames at 44.1 kHz = 23 197 278 ns.
    assertEquals(END_MS - 23.197278, reading.peakTimestampMs, TIME_DELTA_MS)
    assertEquals(END_MS, reading.timestampMs, 0.0)
  }

  @Test
  fun `a peak in the middle of the buffer is timed by the frames after it`() {
    val buffer = ShortArray(FULL_BUFFER_FRAMES).also { it[512] = 12000 }

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    // 511 frames after the peak = 11 587 301 ns.
    assertEquals(END_MS - 11.587301, reading.peakTimestampMs, TIME_DELTA_MS)
  }

  @Test
  fun `equal peaks keep the earliest one`() {
    val buffer = shortArrayOf(0, 1000, 0, 1000)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    // Frame 1 of 4, so 2 frames (45 351 ns) before the end — not frame 3.
    assertEquals(END_MS - 0.045351, reading.peakTimestampMs, TIME_DELTA_MS)
  }

  @Test
  fun `a later sample of equal magnitude and opposite sign does not move the peak`() {
    val buffer = shortArrayOf(0, 1000, 0, -1000)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    assertEquals(END_MS - 0.045351, reading.peakTimestampMs, TIME_DELTA_MS)
  }

  @Test
  fun `a negative sample is the peak when its magnitude is largest`() {
    val buffer = shortArrayOf(5000, 100, -20000, 100)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    // 20000 / 32768; frame 2 of 4, so 1 frame (22 675 ns) before the end.
    assertEquals(0.6103515625, reading.peak, LEVEL_DELTA)
    assertEquals(END_MS - 0.022675, reading.peakTimestampMs, TIME_DELTA_MS)
  }

  @Test
  fun `a silent buffer times its peak at the first frame`() {
    val buffer = ShortArray(4)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    // No sample exceeds zero, so the peak index stays at frame 0: 3 frames back.
    assertEquals(END_MS - 0.068027, reading.peakTimestampMs, TIME_DELTA_MS)
  }

  // --- onset ---

  @Test
  fun `an impulse starts where it peaks`() {
    val buffer = ShortArray(FULL_BUFFER_FRAMES).also { it[512] = 12000 }

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    assertEquals(reading.peakTimestampMs, reading.onsetTimestampMs, 0.0)
  }

  @Test
  fun `a sound starts at the first sample that reaches half its peak`() {
    val buffer = shortArrayOf(0, 6000, 0, 10000)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    // Onset is frame 1 (2 frames before the end); the peak is the last frame.
    assertEquals(END_MS - 0.045351, reading.onsetTimestampMs, TIME_DELTA_MS)
    assertEquals(END_MS, reading.peakTimestampMs, 0.0)
  }

  @Test
  fun `a sample at exactly half the peak is the onset`() {
    val buffer = shortArrayOf(5000, 0, 10000, 0)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    // Frame 0 of 4: 3 frames (68 027 ns) before the end.
    assertEquals(END_MS - 0.068027, reading.onsetTimestampMs, TIME_DELTA_MS)
  }

  @Test
  fun `a sample just under half the peak is not the onset`() {
    val buffer = shortArrayOf(4999, 0, 10000, 0)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    assertEquals(reading.peakTimestampMs, reading.onsetTimestampMs, 0.0)
  }

  @Test
  fun `room noise in front of a sound is stepped over`() {
    val buffer = ShortArray(FULL_BUFFER_FRAMES) { index -> if (index < 500) 1000 else 0 }
    buffer[500] = 20000

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    // Frame 500: 523 frames (11 859 410 ns) before the end.
    assertEquals(END_MS - 11.859410, reading.onsetTimestampMs, TIME_DELTA_MS)
  }

  @Test
  fun `the onset counts a negative sample by its magnitude`() {
    val buffer = shortArrayOf(0, -6000, 0, 10000)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    assertEquals(END_MS - 0.045351, reading.onsetTimestampMs, TIME_DELTA_MS)
  }

  @Test
  fun `a tone that fades in starts inside its fade, long before it peaks`() {
    // A 1 kHz tone that begins at frame 300 and takes 5 ms (220 frames) to
    // reach full level, as the start beep does.
    val toneStart = 300
    val fadeFrames = 220
    val buffer =
      ShortArray(FULL_BUFFER_FRAMES) { index ->
        if (index < toneStart) {
          0
        } else {
          val sinceStart = index - toneStart
          val gain = minOf(1.0, sinceStart.toDouble() / fadeFrames)
          (16000 * gain * sin(2 * Math.PI * 1000 * sinceStart / 44100.0)).toInt().toShort()
        }
      }

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    val toneStartMs = END_MS - (FULL_BUFFER_FRAMES - 1 - toneStart) * 1000.0 / 44100
    // Half the level is passed half-way up the fade, at the next crest of
    // the tone: between 2.5 and 3.0 ms in.
    assertTrue(reading.onsetTimestampMs >= toneStartMs + 2.5)
    assertTrue(reading.onsetTimestampMs <= toneStartMs + 3.0)
    // The peak is somewhere in the steady part of the tone, milliseconds on.
    assertTrue(reading.peakTimestampMs > reading.onsetTimestampMs + 2.0)
  }

  @Test
  fun `noise at more than half the level of a sound is taken for its start`() {
    // The onset is judged against the buffer's own peak, so a loud room
    // moves it early. The beep is only looked for well clear of the room.
    val buffer = ShortArray(FULL_BUFFER_FRAMES) { index -> if (index < 500) 1500 else 0 }
    buffer[500] = 2500

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    // Frame 0 of 1024: 1023 frames (23 197 278 ns) before the end.
    assertEquals(END_MS - 23.197278, reading.onsetTimestampMs, TIME_DELTA_MS)
  }

  @Test
  fun `the most negative sample as the peak still finds its half-level onset`() {
    val buffer = shortArrayOf(0, -16383, -16384, Short.MIN_VALUE)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    // 16384 is exactly half of 32768: frame 2, one frame before the end.
    assertEquals(END_MS - 0.022675, reading.onsetTimestampMs, TIME_DELTA_MS)
    assertEquals(END_MS, reading.peakTimestampMs, 0.0)
  }

  @Test
  fun `a silent buffer times its onset at the first frame`() {
    val buffer = ShortArray(4)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    assertEquals(END_MS - 0.068027, reading.onsetTimestampMs, TIME_DELTA_MS)
  }

  @Test
  fun `the onset is never after the peak`() {
    val buffer = shortArrayOf(100, 9000, -9000, 9000, 200)

    val reading = computeReading(buffer, buffer.size, END_NANOS)

    assertEquals(reading.peakTimestampMs, reading.onsetTimestampMs, 0.0)
  }

  // --- timestamps ---

  @Test
  fun `timestamps are fractional milliseconds derived from nanoseconds`() {
    val buffer = shortArrayOf(0, 0, 0, 9000)

    val reading = computeReading(buffer, buffer.size, 1_500_000L)

    assertEquals(1.5, reading.timestampMs, 0.0)
    assertEquals(1.5, reading.peakTimestampMs, 0.0)
  }

  @Test
  fun `a sub-microsecond part of the read time survives the conversion`() {
    val buffer = shortArrayOf(0, 0, 0, 9000)

    val reading = computeReading(buffer, buffer.size, 2_000_123_456L)

    assertEquals(2000.123456, reading.timestampMs, TIME_DELTA_MS)
  }

  @Test
  fun `ten days of uptime keeps sub-millisecond precision`() {
    // 10 days = 864 000 000 000 000 ns, plus 123 456 ns.
    val tenDaysNanos = 864_000_000_123_456L
    val buffer = shortArrayOf(0, 0, 9000, 0)

    val reading = computeReading(buffer, buffer.size, tenDaysNanos)

    assertEquals(864_000_000.123456, reading.timestampMs, TIME_DELTA_MS)
    // The peak is one frame (22 675 ns) before the end, and that gap is still resolvable.
    assertEquals(0.022675, reading.timestampMs - reading.peakTimestampMs, TIME_DELTA_MS)
  }

  // --- helpers ---

  @Test
  fun `normalize clamps a level above full scale to 1`() {
    assertEquals(1.0, normalize(40000.0), 0.0)
  }

  @Test
  fun `toDbfs clamps a level above full scale to 0 dB`() {
    assertEquals(0.0, toDbfs(40000.0), 0.0)
  }

  @Test
  fun `toDbfs reports the floor for zero instead of negative infinity`() {
    assertEquals(-160.0, toDbfs(0.0), 0.0)
  }

  @Test
  fun `toDbfs of the quietest non-zero sample is well above the floor`() {
    // 20 * log10(1 / 32768) = -90.309
    assertEquals(-90.308998699, toDbfs(1.0), DB_DELTA)
  }

  @Test
  fun `capture buffer is raised to one full read when the device minimum is smaller`() {
    // 1024 frames * 2 bytes per 16-bit mono frame.
    assertEquals(2048, captureBufferSizeBytes(1024))
  }

  @Test
  fun `capture buffer keeps the device minimum when it is larger than one read`() {
    assertEquals(7104, captureBufferSizeBytes(7104))
  }

  private companion object {
    const val FULL_BUFFER_FRAMES = 1024
    const val END_NANOS = 5_000_000_000L
    const val END_MS = 5000.0
    const val LEVEL_DELTA = 1e-9
    const val DB_DELTA = 1e-6
    const val TIME_DELTA_MS = 1e-6
  }
}

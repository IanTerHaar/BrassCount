package com.brasscount.app.audio

import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sqrt

// Pure level and timestamp maths for the capture stream. Nothing in this
// file may import android.* or React Native, so it runs in local JVM unit
// tests (see AudioLevelsTest). AudioCaptureModule owns the AudioRecord and
// the clock and calls in here once per buffer.

// Capture format shared by the module (which opens the recorder with it) and
// the maths below (which turns frame counts into time).
internal const val SAMPLE_RATE_HZ = 44100
internal const val FRAMES_PER_BUFFER = 1024
internal const val BYTES_PER_SAMPLE = 2

/** Magnitude of the most negative 16-bit sample; the 0 dBFS reference. */
internal const val MAX_PCM_16_AMPLITUDE = 32768.0

/** Reported for digital silence instead of negative infinity. */
internal const val MIN_DB = -160.0

/**
 * A sound is taken to start at the first sample that reaches half the level
 * of the loudest one in its buffer. Low enough to land on the rising edge of
 * a tone that takes a few milliseconds to reach full level, high enough to
 * step over the room noise in front of it, as long as that noise is under
 * half the level of the sound.
 *
 * Half a level is 6 dB: HALF_LEVEL_DB in src/utils/runDetection.ts says the
 * same thing on the JS side, and the two must stay in step.
 */
internal const val ONSET_PEAK_DIVISOR = 2

private const val MAX_DB = 0.0
internal const val NANOS_PER_SECOND = 1_000_000_000L
private const val NANOS_PER_MILLI = 1_000_000.0

/**
 * One buffer's worth of level data. Levels are normalized to 0..1 and dBFS
 * (MIN_DB..0); timestamps are monotonic milliseconds with sub-millisecond
 * precision.
 */
internal data class Reading(
  val amplitude: Double,
  val db: Double,
  val peak: Double,
  val peakDb: Double,
  val timestampMs: Double,
  val peakTimestampMs: Double,
  val onsetTimestampMs: Double,
)

/**
 * Size to request for the AudioRecord buffer: the device minimum, but never
 * less than one full read of [FRAMES_PER_BUFFER] frames.
 */
internal fun captureBufferSizeBytes(minBufferSizeBytes: Int): Int =
  maxOf(minBufferSizeBytes, FRAMES_PER_BUFFER * BYTES_PER_SAMPLE)

/**
 * Computes the RMS and peak levels of the first [framesRead] samples of
 * [buffer]; anything after them is stale data from an earlier read.
 * [bufferEndNanos] is the monotonic capture time of the last frame read (see
 * CaptureClock). [framesRead] must be in 1..buffer.size — the caller drops
 * empty and failed reads before getting here.
 */
internal fun computeReading(buffer: ShortArray, framesRead: Int, bufferEndNanos: Long): Reading {
  var sumOfSquares = 0.0
  var peakSample = 0
  var peakIndex = 0
  for (i in 0 until framesRead) {
    val sample = buffer[i].toInt()
    sumOfSquares += sample.toDouble() * sample
    val magnitude = abs(sample)
    // Strictly greater: of several equal peaks the earliest one is kept.
    if (magnitude > peakSample) {
      peakSample = magnitude
      peakIndex = i
    }
  }
  val rms = sqrt(sumOfSquares / framesRead)
  val onsetIndex = onsetIndex(buffer, peakIndex, peakSample)
  return Reading(
    amplitude = normalize(rms),
    db = toDbfs(rms),
    peak = normalize(peakSample.toDouble()),
    peakDb = toDbfs(peakSample.toDouble()),
    timestampMs = nanosToMillis(bufferEndNanos),
    peakTimestampMs = nanosToMillis(frameNanos(peakIndex, framesRead, bufferEndNanos)),
    onsetTimestampMs = nanosToMillis(frameNanos(onsetIndex, framesRead, bufferEndNanos)),
  )
}

/**
 * Index of the first sample at or above half of [peakSample], looking no
 * further than the peak itself at [peakIndex]. The peak of an impulse is its
 * own onset to within a few samples; the peak of a tone can be anywhere in
 * the buffer, long after the tone began, and this finds where it began.
 */
private fun onsetIndex(buffer: ShortArray, peakIndex: Int, peakSample: Int): Int {
  for (i in 0 until peakIndex) {
    if (abs(buffer[i].toInt()) * ONSET_PEAK_DIVISOR >= peakSample) {
      return i
    }
  }
  return peakIndex
}

/**
 * Capture time of the frame at [index] in a read of [framesRead] frames
 * whose last frame was captured at [bufferEndNanos]: walks back from the end
 * of the buffer, so a sound is timed to the sample rather than to the buffer.
 */
private fun frameNanos(index: Int, framesRead: Int, bufferEndNanos: Long): Long {
  val framesAfter = (framesRead - 1 - index).toLong()
  return bufferEndNanos - framesAfter * NANOS_PER_SECOND / SAMPLE_RATE_HZ
}

/** Monotonic nanoseconds as the fractional milliseconds JS is given. */
internal fun nanosToMillis(nanos: Long): Double = nanos / NANOS_PER_MILLI

/** Scales a raw 16-bit sample magnitude to 0..1. */
internal fun normalize(level: Double): Double = (level / MAX_PCM_16_AMPLITUDE).coerceIn(0.0, 1.0)

/** Converts a raw 16-bit sample magnitude to dBFS, clamped to MIN_DB..0. */
internal fun toDbfs(level: Double): Double =
  if (level > 0) {
    (20.0 * log10(level / MAX_PCM_16_AMPLITUDE)).coerceIn(MIN_DB, MAX_DB)
  } else {
    MIN_DB
  }

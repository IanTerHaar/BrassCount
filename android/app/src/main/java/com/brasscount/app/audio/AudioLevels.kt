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

private const val MAX_DB = 0.0
private const val NANOS_PER_SECOND = 1_000_000_000L
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
 * [readEndNanos] is the monotonic time the read returned, i.e. the capture
 * time of the last frame read. [framesRead] must be in 1..buffer.size — the
 * caller drops empty and failed reads before getting here.
 */
internal fun computeReading(buffer: ShortArray, framesRead: Int, readEndNanos: Long): Reading {
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
  // Walk back from the end of the buffer to the frame that held the peak,
  // so an impulse is timed to the sample rather than to the buffer.
  val framesAfterPeak = (framesRead - 1 - peakIndex).toLong()
  val peakNanos = readEndNanos - framesAfterPeak * NANOS_PER_SECOND / SAMPLE_RATE_HZ
  return Reading(
    amplitude = normalize(rms),
    db = toDbfs(rms),
    peak = normalize(peakSample.toDouble()),
    peakDb = toDbfs(peakSample.toDouble()),
    timestampMs = readEndNanos / NANOS_PER_MILLI,
    peakTimestampMs = peakNanos / NANOS_PER_MILLI,
  )
}

/** Scales a raw 16-bit sample magnitude to 0..1. */
internal fun normalize(level: Double): Double = (level / MAX_PCM_16_AMPLITUDE).coerceIn(0.0, 1.0)

/** Converts a raw 16-bit sample magnitude to dBFS, clamped to MIN_DB..0. */
internal fun toDbfs(level: Double): Double =
  if (level > 0) {
    (20.0 * log10(level / MAX_PCM_16_AMPLITUDE)).coerceIn(MIN_DB, MAX_DB)
  } else {
    MIN_DB
  }

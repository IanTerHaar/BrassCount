package com.brasscount.app.audio

import kotlin.math.abs

// Pure timing for the capture stream: when was the last frame of a buffer
// actually captured? Nothing in this file may import android.* or React
// Native, so it runs in local JVM unit tests (see CaptureClockTest).
//
// The moment a read returns is a poor answer. The audio hardware hands
// frames over in bursts, so a read that needs the last few frames of a burst
// returns when that burst lands, and the same frame can be stamped anywhere
// within a burst's length (about 20 ms on many devices). Two shots 200 ms
// apart would then read as anything from 180 to 220.
//
// The audio hardware also keeps its own count of frames captured and can say
// what the clock read at a given count (AudioRecord.getTimestamp). Frames are
// captured at a steady rate, so those pairs lie on a straight line, and any
// frame's capture time can be read off it however late its read returns.
//
// A single pair cannot be trusted, though: the stamp is taken by a thread
// that may itself have woken late. So the line is drawn through the middle
// of the most recent pairs, which a few bad stamps cannot move, and it is
// only believed at all once the pairs agree on the rate frames are counted
// at. Whenever the line cannot be vouched for, the buffer says so.

/** A frame count the audio hardware reached, and the monotonic time it did. */
internal data class FrameAnchor(val framePosition: Long, val nanoTime: Long)

/** When the last frame of a buffer was captured, and which clock said so. */
internal data class BufferTime(
  val endNanos: Long,
  /**
   * True when [endNanos] was read off the hardware's frame count, and that
   * count has been heard from recently and is holding steady.
   */
  val frameTimed: Boolean,
)

/**
 * How long after capture starts the frame clock may still be adopted, in
 * frames: three quarters of a second. Buffers before it is adopted are
 * stamped as their reads return, buffers after it by capture time, which is
 * earlier by the input latency. So the timeline steps back once, at the
 * adoption, and a device that has not got there by now is timed by read
 * returns for the whole capture, never switched part-way through a run.
 *
 * CAPTURE_CLOCK_SETTLE_MS in src/types/audio.ts mirrors this: nothing may be
 * timed against a reading from before it.
 */
internal const val FRAME_CLOCK_ADOPTION_FRAMES = SAMPLE_RATE_HZ * 3 / 4

/**
 * Longest a frame can plausibly wait between being captured and being read.
 * An anchor that implies more, or that puts a frame after its own read, is
 * not describing this stream.
 */
private const val MAX_CAPTURE_LAG_NANOS = 1_000_000_000L

/**
 * How many recent anchors the line is drawn through, about three quarters of
 * a second of them. The quarter stamped earliest and the quarter stamped
 * latest are left out and the rest averaged, so a few stamped late or early
 * do not move it at all, and the jitter of the others moves it by a small
 * fraction of itself. A lasting change carries it along as the recent
 * anchors come to agree on it, and while it is on the move the buffers are
 * not called frame-timed.
 */
private const val ANCHOR_WINDOW = 32

/** Fewest anchors the frame clock is adopted on. */
private const val MIN_ADOPTION_ANCHORS = 8

/** Shortest stretch those anchors must cover for their rate to be judged: 300 ms. */
private const val MIN_ADOPTION_SPAN_FRAMES = SAMPLE_RATE_HZ * 3 / 10

/**
 * How far the anchors may drift, from the oldest of them to the newest, and
 * still be counting frames at the rate this stream is read at: one part in
 * this many of the stretch they cover, 2%. A device that counts in its
 * hardware's frames (48 kHz against the 44.1 kHz read here) drifts by 8%,
 * and its clock would run that much fast.
 */
private const val MAX_RATE_ERROR_DIVISOR = 50

/**
 * Once the clock is adopted, how far from its line an anchor may be and
 * still be taken up: 100 ms. Frames dropped in an overrun move the anchors
 * by less than that; anything further out is a stale or broken stamp.
 */
private const val MAX_ANCHOR_STEP_NANOS = 100_000_000L

/** How many of the newest anchors show where the line is heading. */
private const val RECENT_ANCHORS = 8

/**
 * How far the newest anchors may sit from the line before the line is
 * taken to be on the move: 5 ms, clear of the jitter of honest stamps.
 */
private const val MOVING_LINE_NANOS = 5_000_000L

/**
 * How long the frame clock goes on being reported as such with no usable
 * anchor, in frames: two seconds. Past that the line is still followed, so
 * times do not jump, but it is no longer known to be right.
 */
private const val ANCHOR_STALE_FRAMES = 2 * SAMPLE_RATE_HZ

/** Largest frame count taken seriously: about 260 days of capture. */
private const val MAX_FRAME_POSITION = 1_000_000_000_000L

/** How long a number of frames lasts at the capture rate. */
private fun framesToNanos(frames: Long): Long = frames * NANOS_PER_SECOND / SAMPLE_RATE_HZ

/** The middle value of a few numbers; the mean of the middle two when even. */
private fun median(values: LongArray): Long {
  val sorted = values.sortedArray()
  val middle = sorted.size / 2
  return if (sorted.size % 2 == 1) {
    sorted[middle]
  } else {
    sorted[middle - 1] + (sorted[middle] - sorted[middle - 1]) / 2
  }
}

/**
 * Times the buffers of one capture session. Holds the running frame count,
 * so it is created when capture starts and used from the capture thread
 * only.
 */
internal class CaptureClock {
  private var framesRead = 0L

  // Where each recent anchor puts frame zero of the stream, oldest first
  // until the ring wraps. All of them would be the same number on a
  // perfect device.
  private val origins = LongArray(ANCHOR_WINDOW)
  private var originCount = 0
  private var nextOrigin = 0

  private var firstPosition = -1L
  private var lastPosition = -1L
  private var adopted = false
  private var framesAtLastAnchor = 0L

  /**
   * Records a read of [framesInRead] frames that returned at [readEndNanos]
   * and returns the capture time of its last frame. [candidate] is the
   * hardware's current anchor, or null when it has none to give.
   */
  fun onRead(framesInRead: Int, readEndNanos: Long, candidate: FrameAnchor?): BufferTime {
    framesRead += framesInRead

    val mayUse = adopted || framesRead <= FRAME_CLOCK_ADOPTION_FRAMES
    if (mayUse && candidate != null && isUsable(candidate, readEndNanos)) {
      remember(candidate)
      adopted = adopted || agreesOnRate()
    }

    if (!adopted) {
      return BufferTime(readEndNanos, frameTimed = false)
    }
    val origin = lineOrigin()
    val fresh = framesRead - framesAtLastAnchor <= ANCHOR_STALE_FRAMES
    // A frame cannot have been captured after it was read. The line can
    // drift that far when it has had no anchor to follow for a while.
    return BufferTime(
      endNanos = minOf(origin + framesToNanos(framesRead), readEndNanos),
      frameTimed = fresh && !isMoving(origin),
    )
  }

  private fun originOf(anchor: FrameAnchor): Long =
    anchor.nanoTime - framesToNanos(anchor.framePosition)

  /** Whether an anchor is a new one, describes this stream, and fits the line. */
  private fun isUsable(candidate: FrameAnchor, readEndNanos: Long): Boolean {
    // The hardware repeats its last anchor until it has a newer one. The
    // same stamp counted twice would weigh twice.
    if (candidate.framePosition <= lastPosition || candidate.framePosition > MAX_FRAME_POSITION) {
      return false
    }
    val endNanos = candidate.nanoTime + framesToNanos(framesRead - candidate.framePosition)
    if (endNanos > readEndNanos || endNanos < readEndNanos - MAX_CAPTURE_LAG_NANOS) {
      return false
    }
    return !adopted || abs(originOf(candidate) - lineOrigin()) <= MAX_ANCHOR_STEP_NANOS
  }

  private fun remember(anchor: FrameAnchor) {
    origins[nextOrigin] = originOf(anchor)
    nextOrigin = (nextOrigin + 1) % ANCHOR_WINDOW
    originCount = minOf(originCount + 1, ANCHOR_WINDOW)
    if (firstPosition < 0) {
      firstPosition = anchor.framePosition
    }
    lastPosition = anchor.framePosition
    framesAtLastAnchor = framesRead
  }

  /**
   * Whether enough anchors have been seen, over a long enough stretch, to
   * say they count frames at the rate this stream is read at. Anchors that
   * count at another rate drift steadily against it, so the oldest third
   * of them is compared with the newest third, each by its median: one
   * late stamp at either end then decides nothing.
   *
   * Only asked before the clock is adopted, while the ring has not wrapped
   * and still holds the anchors oldest first.
   */
  private fun agreesOnRate(): Boolean {
    val spanFrames = lastPosition - firstPosition
    if (originCount < MIN_ADOPTION_ANCHORS || spanFrames < MIN_ADOPTION_SPAN_FRAMES) {
      return false
    }
    val third = originCount / 3
    val oldest = median(origins.copyOfRange(0, third))
    val newest = median(origins.copyOfRange(originCount - third, originCount))
    return abs(newest - oldest) * MAX_RATE_ERROR_DIVISOR <= framesToNanos(spanFrames)
  }

  /**
   * Where the line puts frame zero of the stream: the mean of the middle
   * half of what the recent anchors say.
   */
  private fun lineOrigin(): Long {
    val sorted = origins.copyOf(originCount).also { it.sort() }
    val trimmed = originCount / 4
    val kept = originCount - 2 * trimmed
    // Averaged as differences from the first one kept: the values
    // themselves are nanoseconds since boot, too large to add up safely.
    val base = sorted[trimmed]
    var sum = 0L
    for (i in trimmed until originCount - trimmed) {
      sum += sorted[i] - base
    }
    return base + sum / kept
  }

  /**
   * Whether the newest anchors have left the line behind, which is what a
   * lasting change looks like while the line is still catching up with it.
   */
  private fun isMoving(origin: Long): Boolean {
    val recent = minOf(originCount, RECENT_ANCHORS)
    val newest = LongArray(recent) { back ->
      origins[(nextOrigin - 1 - back + ANCHOR_WINDOW) % ANCHOR_WINDOW]
    }
    return abs(median(newest) - origin) > MOVING_LINE_NANOS
  }
}

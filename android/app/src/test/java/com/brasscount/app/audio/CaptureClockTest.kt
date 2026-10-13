package com.brasscount.app.audio

import kotlin.math.abs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureClockTest {

  // --- no frame clock ---

  @Test
  fun `a device with no frame timestamp is timed by when the read returned`() {
    val stream = Stream()
    val clock = CaptureClock()

    val times = (1..40).map { read -> clock.onRead(BUFFER, stream.readEnd(read), null) }

    times.forEachIndexed { index, time ->
      assertEquals(stream.readEnd(index + 1), time.endNanos)
      assertFalse(time.frameTimed)
    }
  }

  // --- adopting the frame clock ---

  @Test
  fun `the frame clock is not adopted until its anchors cover 300 ms`() {
    val stream = Stream()
    val clock = CaptureClock()

    // Thirteen anchors, one a read: 12 buffers apart, 279 ms.
    val times = (1..13).map { read -> clock.read(stream, read) }

    times.forEachIndexed { index, time ->
      assertEquals(stream.readEnd(index + 1), time.endNanos)
      assertFalse(time.frameTimed)
    }
  }

  @Test
  fun `the frame clock is adopted once they do, and times the buffer at its capture`() {
    val stream = Stream()
    val clock = CaptureClock()
    (1..13).forEach { read -> clock.read(stream, read) }

    val time = clock.read(stream, 14)

    assertTrue(time.frameTimed)
    assertNanos(stream.capturedAt(14), time.endNanos)
  }

  @Test
  fun `adopting the frame clock steps the timeline back once, by the time reads lag capture`() {
    val stream = Stream()
    val clock = CaptureClock()

    val times = (1..60).map { read -> clock.read(stream, read) }

    // Read 13 is stamped as it returns, 30 ms after its capture. Read 14 is
    // stamped at its capture, one buffer on: 6.8 ms before read 13's stamp.
    assertNanos(BUFFER_NANOS - 30 * MS, times[13].endNanos - times[12].endNanos)
    // From there on the timeline only moves forward, a buffer at a time.
    (14 until 60).forEach { index ->
      assertNanos(BUFFER_NANOS, times[index].endNanos - times[index - 1].endNanos)
    }
  }

  @Test
  fun `the frame clock is adopted when its anchors start late but still in time`() {
    val stream = Stream()
    val clock = CaptureClock()
    (1..18).forEach { read -> clock.onRead(BUFFER, stream.readEnd(read), null) }

    // Anchors from read 19 cover 300 ms by read 32, which ends at frame
    // 32768, still inside the first three quarters of a second (33075).
    val times = (19..32).map { read -> clock.read(stream, read) }

    assertFalse(times[12].frameTimed)
    assertTrue(times[13].frameTimed)
  }

  @Test
  fun `a frame clock that is not ready in the first three quarters of a second is never adopted`() {
    val stream = Stream()
    val clock = CaptureClock()
    (1..19).forEach { read -> clock.onRead(BUFFER, stream.readEnd(read), null) }

    // Anchors from read 20 would cover 300 ms at read 33, which is too late.
    val times = (20..80).map { read -> clock.read(stream, read) }

    times.forEachIndexed { index, time ->
      assertFalse(time.frameTimed)
      assertEquals(stream.readEnd(index + 20), time.endNanos)
    }
  }

  @Test
  fun `a device that counts frames at another rate is never adopted`() {
    val stream = Stream()
    val clock = CaptureClock()

    // The hardware counts its own 48 kHz frames, not the 44.1 kHz read here.
    val times = (1..32).map { read -> clock.onRead(BUFFER, stream.readEnd(read), stream.anchorAt48k(read)) }

    times.forEach { time -> assertFalse(time.frameTimed) }
  }

  @Test
  fun `stamps up to 6 ms late do not get a device that counts at another rate adopted`() {
    val stream = Stream()

    for (trial in 1..200) {
      val clock = CaptureClock()
      val jitter = Jitter(seed = trial.toLong(), maxNanos = 6 * MS)
      val times =
        (1..32).map { read ->
          clock.onRead(BUFFER, stream.readEnd(read), stream.anchorAt48k(read, lateNanos = jitter.next()))
        }
      assertFalse("adopted in trial $trial", times.any { it.frameTimed })
    }
  }

  @Test
  fun `stamps up to 6 ms late do not keep a good device from being adopted`() {
    val stream = Stream()

    for (trial in 1..200) {
      val clock = CaptureClock()
      val jitter = Jitter(seed = trial.toLong(), maxNanos = 6 * MS)
      val times =
        (1..32).map { read ->
          clock.onRead(BUFFER, stream.readEnd(read), stream.anchor(read, lateNanos = jitter.next()))
        }
      assertTrue("not adopted in trial $trial", times.last().frameTimed)
    }
  }

  @Test
  fun `an audio clock that runs a hair fast is still adopted`() {
    val stream = Stream()
    val clock = CaptureClock()

    // 200 parts per million fast: 4.6 microseconds a buffer.
    val times =
      (1..16).map { read ->
        val anchor = FrameAnchor(stream.framesAfter(read), stream.capturedAt(read) - read * 4_644L)
        clock.onRead(BUFFER, stream.readEnd(read), anchor)
      }

    assertTrue(times.last().frameTimed)
  }

  @Test
  fun `a first anchor stamped 25 ms late does not keep a good device from being adopted`() {
    val stream = Stream()
    val clock = CaptureClock()
    clock.onRead(BUFFER, stream.readEnd(1), stream.anchor(1, lateNanos = 25 * MS))

    val times = (2..16).map { read -> clock.read(stream, read) }

    assertTrue(times.last().frameTimed)
    assertNanos(stream.capturedAt(16), times.last().endNanos)
  }

  @Test
  fun `an anchor the hardware repeats is counted once`() {
    val stream = Stream()
    val clock = CaptureClock()

    // The hardware has a new anchor every fourth read and repeats it in
    // between. Eight different anchors have been seen by read 29.
    val times = (1..40).map { read -> clock.onRead(BUFFER, stream.readEnd(read), stream.anchor(read - (read - 1) % 4)) }

    assertFalse(times[27].frameTimed)
    assertTrue(times[28].frameTimed)
    assertNanos(stream.capturedAt(40), times[39].endNanos)
  }

  @Test
  fun `a device whose anchors come too rarely is timed by read returns`() {
    val stream = Stream()
    val clock = CaptureClock()

    // A new anchor every sixth read: the eighth would come with read 43.
    val times = (1..80).map { read -> clock.onRead(BUFFER, stream.readEnd(read), stream.anchor(read - (read - 1) % 6)) }

    times.forEach { time -> assertFalse(time.frameTimed) }
  }

  @Test
  fun `anchors that time a buffer after its read returned do not count towards adopting`() {
    val stream = Stream()
    val clock = CaptureClock()

    val times =
      (1..32).map { read ->
        clock.onRead(BUFFER, stream.readEnd(read), FrameAnchor(stream.framesAfter(read), stream.readEnd(read) + 1))
      }

    times.forEach { time -> assertFalse(time.frameTimed) }
  }

  @Test
  fun `anchors that time a buffer more than a second before its read do not count either`() {
    val stream = Stream()
    val clock = CaptureClock()

    val times =
      (1..32).map { read ->
        clock.onRead(
          BUFFER,
          stream.readEnd(read),
          FrameAnchor(stream.framesAfter(read), stream.readEnd(read) - 1001 * MS),
        )
      }

    times.forEach { time -> assertFalse(time.frameTimed) }
  }

  @Test
  fun `anchors exactly a second behind their reads are still used`() {
    val stream = Stream()
    val clock = CaptureClock()

    val times =
      (1..14).map { read ->
        clock.onRead(
          BUFFER,
          stream.readEnd(read),
          FrameAnchor(stream.framesAfter(read), stream.readEnd(read) - 1000 * MS),
        )
      }

    assertTrue(times.last().frameTimed)
    assertNanos(stream.readEnd(14) - 1000 * MS, times.last().endNanos)
  }

  @Test
  fun `anchors with no time or an impossible frame count are not used`() {
    val stream = Stream()

    val broken =
      listOf<(Int) -> FrameAnchor>(
        { FrameAnchor(0, 0) },
        { read -> FrameAnchor(-stream.framesAfter(read), stream.capturedAt(read)) },
        { read -> FrameAnchor(10_000_000_000_000L + read, stream.capturedAt(read)) },
      )
    for (anchorFor in broken) {
      val clock = CaptureClock()
      val times = (1..32).map { read -> clock.onRead(BUFFER, stream.readEnd(read), anchorFor(read)) }
      times.forEach { time -> assertFalse(time.frameTimed) }
    }
  }

  // --- frame arithmetic ---

  @Test
  fun `reads that return late or early are still timed one buffer apart`() {
    val stream = Stream()
    val clock = CaptureClock().adoptedOn(stream)

    val first = clock.read(stream, 17).endNanos
    // The next read returns 9 ms late and the one after 6 ms early.
    val second = clock.onRead(BUFFER, stream.readEnd(18) + 9 * MS, stream.anchor(18)).endNanos
    val third = clock.onRead(BUFFER, stream.readEnd(19) - 6 * MS, stream.anchor(19)).endNanos

    assertNanos(BUFFER_NANOS, second - first)
    assertNanos(BUFFER_NANOS, third - second)
  }

  @Test
  fun `hardware that has counted past the frames read puts the buffer end before its anchors`() {
    // The hardware is 441 frames (10 ms) ahead of what has been read.
    val stream = Stream(aheadFrames = 441)
    val clock = CaptureClock().adoptedOn(stream)

    val time = clock.read(stream, 17)

    assertNanos(stream.anchor(17).nanoTime - 10 * MS, time.endNanos)
    assertNanos(stream.capturedAt(17), time.endNanos)
  }

  @Test
  fun `hardware that reports behind the frames read puts the buffer end after its anchors`() {
    val stream = Stream(aheadFrames = -441)
    val clock = CaptureClock().adoptedOn(stream)

    val time = clock.read(stream, 17)

    assertNanos(stream.anchor(17).nanoTime + 10 * MS, time.endNanos)
  }

  @Test
  fun `a short read counts only the frames it delivered`() {
    val stream = Stream()
    val clock = CaptureClock().adoptedOn(stream)
    val before = clock.read(stream, 17).endNanos

    // 441 frames: 10 ms of audio, not a whole buffer.
    val time = clock.onRead(441, stream.readEnd(17) + 10 * MS, null)

    assertNanos(before + 10 * MS, time.endNanos)
  }

  @Test
  fun `ten days of uptime keeps frame timing exact`() {
    val stream = Stream(startNanos = 864_000_000_000_000L)
    val clock = CaptureClock().adoptedOn(stream)

    val first = clock.read(stream, 17).endNanos
    val second = clock.read(stream, 18).endNanos

    assertNanos(stream.capturedAt(17), first)
    assertNanos(BUFFER_NANOS, second - first)
  }

  // --- anchors that are wrong ---

  @Test
  fun `one anchor stamped 12 ms late does not move the buffer it arrives with`() {
    val stream = Stream()
    val clock = CaptureClock().adoptedOn(stream)
    val before = clock.read(stream, 17)

    val withIt = clock.onRead(BUFFER, stream.readEnd(18), stream.anchor(18, lateNanos = 12 * MS))
    val after = clock.read(stream, 19)

    assertNanos(BUFFER_NANOS, withIt.endNanos - before.endNanos)
    assertNanos(BUFFER_NANOS, after.endNanos - withIt.endNanos)
    assertTrue(withIt.frameTimed)
  }

  @Test
  fun `one anchor stamped early does not move it either`() {
    val stream = Stream()
    val clock = CaptureClock().adoptedOn(stream)
    val before = clock.read(stream, 17)

    val withIt = clock.onRead(BUFFER, stream.readEnd(18), stream.anchor(18, lateNanos = -8 * MS))
    val after = clock.read(stream, 19)

    assertNanos(BUFFER_NANOS, withIt.endNanos - before.endNanos)
    assertNanos(BUFFER_NANOS, after.endNanos - withIt.endNanos)
    assertTrue(withIt.frameTimed)
  }

  @Test
  fun `anchors stamped up to 6 ms late at random leave the buffers evenly spaced`() {
    val stream = Stream()
    val clock = CaptureClock()
    val jitter = Jitter(seed = 20261012L, maxNanos = 6 * MS)
    var previous: BufferTime? = null
    var worstSpacingError = 0L

    for (read in 1..4000) {
      val time = clock.onRead(BUFFER, stream.readEnd(read), stream.anchor(read, lateNanos = jitter.next()))
      val last = previous
      // Judged once the line has all the anchors it works from.
      if (last != null && read > 60) {
        assertTrue("read $read was not frame-timed", time.frameTimed)
        assertTrue("time went back at read $read", time.endNanos > last.endNanos)
        worstSpacingError = maxOf(worstSpacingError, abs(time.endNanos - last.endNanos - BUFFER_NANOS))
      }
      previous = time
    }

    // The anchors themselves are up to 6 ms off; no buffer moves by more
    // than a small fraction of that against the one before it.
    assertTrue("worst spacing error was $worstSpacingError ns", worstSpacingError < MS / 2)
  }

  @Test
  fun `a run of late anchors moves the line a little, and it is not called exact meanwhile`() {
    val stream = Stream()
    val clock = CaptureClock()
    (1..60).forEach { read -> clock.read(stream, read) }

    // Nine anchors in a row stamped 12 ms late: more than the quarter of
    // the window that is left out, so the ninth is counted.
    val during =
      (61..69).map { read -> clock.onRead(BUFFER, stream.readEnd(read), stream.anchor(read, lateNanos = 12 * MS)) }
    val after = (70..80).map { read -> clock.read(stream, read) }

    // One of sixteen kept anchors is 12 ms out: 0.75 ms, reached in one step.
    assertNanos(stream.capturedAt(68), during[7].endNanos)
    assertNanos(stream.capturedAt(69) + 12 * MS / 16, during[8].endNanos)
    assertTrue(during.any { !it.frameTimed })
    assertTrue(after.last().frameTimed)
  }

  @Test
  fun `a lasting shift in the anchors is followed, and the buffers are not called exact until it is`() {
    // Enough latency that the shifted line still lies before each read.
    val stream = Stream(latencyNanos = 80 * MS)
    val clock = CaptureClock()
    (1..60).forEach { read -> clock.read(stream, read) }

    // Frames were dropped: from here every frame was captured 50 ms later
    // than the frame count alone says.
    val shifted =
      (61..100).map { read -> clock.onRead(BUFFER, stream.readEnd(read), stream.anchor(read, lateNanos = 50 * MS)) }

    // A quarter of the window in (8 reads) the old line still holds, half
    // way in the line is half way across, three quarters in it has arrived.
    assertNanos(stream.capturedAt(68), shifted[7].endNanos)
    assertNanos(stream.capturedAt(76) + 25 * MS, shifted[15].endNanos)
    assertNanos(stream.capturedAt(84) + 50 * MS, shifted[23].endNanos)
    assertNanos(stream.capturedAt(100) + 50 * MS, shifted[39].endNanos)
    assertFalse(shifted[7].frameTimed)
    assertFalse(shifted[15].frameTimed)
    assertTrue(shifted[23].frameTimed)
    assertTrue(shifted[39].frameTimed)
  }

  @Test
  fun `anchors far off the line are not taken up once the clock is adopted`() {
    val stream = Stream()
    val clock = CaptureClock().adoptedOn(stream)

    // Stale stamps, 900 ms early: plausible on their own, nowhere near the line.
    val times =
      (17..40).map { read -> clock.onRead(BUFFER, stream.readEnd(read), stream.anchor(read, lateNanos = -900 * MS)) }

    times.forEachIndexed { index, time -> assertNanos(stream.capturedAt(index + 17), time.endNanos) }
  }

  @Test
  fun `anchors whose frame count restarted are not used, and the clock stops being called exact`() {
    val stream = Stream()
    val clock = CaptureClock().adoptedOn(stream)

    // The count restarts from zero at read 17.
    val times =
      (17..120).map { read ->
        clock.onRead(BUFFER, stream.readEnd(read), FrameAnchor(stream.framesAfter(read - 16), stream.capturedAt(read)))
      }

    times.forEachIndexed { index, time -> assertNanos(stream.capturedAt(index + 17), time.endNanos) }
    assertTrue(times.first().frameTimed)
    assertFalse(times.last().frameTimed)
  }

  // --- once adopted, with no anchor ---

  @Test
  fun `a read with no anchor is timed off the line by counting frames`() {
    val stream = Stream()
    val clock = CaptureClock().adoptedOn(stream)
    val before = clock.read(stream, 17).endNanos

    val time = clock.onRead(BUFFER, stream.readEnd(18) + 4 * MS, null)

    assertTrue(time.frameTimed)
    assertNanos(before + BUFFER_NANOS, time.endNanos)
  }

  @Test
  fun `two seconds with no anchor stops the clock being called exact, without moving it`() {
    val stream = Stream()
    val clock = CaptureClock().adoptedOn(stream)

    // The last anchor came with read 16. Two seconds is 88200 frames:
    // read 102 ends 88064 frames later, read 103 ends 89088 later.
    val times = (17..110).map { read -> clock.onRead(BUFFER, stream.readEnd(read), null) }

    assertTrue(times[102 - 17].frameTimed)
    assertFalse(times[103 - 17].frameTimed)
    times.forEachIndexed { index, time -> assertNanos(stream.capturedAt(index + 17), time.endNanos) }
  }

  @Test
  fun `the clock is called exact again when the anchors come back`() {
    val stream = Stream()
    val clock = CaptureClock().adoptedOn(stream)
    (17..110).forEach { read -> clock.onRead(BUFFER, stream.readEnd(read), null) }

    val time = clock.read(stream, 111)

    assertTrue(time.frameTimed)
    assertNanos(stream.capturedAt(111), time.endNanos)
  }

  @Test
  fun `a time read off the line is never after the read returned`() {
    val stream = Stream()
    val clock = CaptureClock().adoptedOn(stream)

    // The read returns 3 ms before the line says its last frame was captured.
    val earlyReadEnd = stream.capturedAt(17) - 3 * MS
    val time = clock.onRead(BUFFER, earlyReadEnd, null)

    assertTrue(time.frameTimed)
    assertEquals(earlyReadEnd, time.endNanos)
  }

  /**
   * A capture as a steady device delivers it: frames captured at exactly the
   * capture rate from [startNanos], each read returning [latencyNanos] after
   * its last frame, and the hardware's frame count [aheadFrames] ahead of
   * the frames read when it is asked.
   */
  private class Stream(
    val startNanos: Long = 5_000_000_000L,
    val latencyNanos: Long = 30 * MS,
    val aheadFrames: Long = 0,
  ) {
    fun framesAfter(read: Int): Long = read.toLong() * BUFFER

    private fun capturedAtFrame(frames: Long): Long = startNanos + frames * 1_000_000_000L / 44_100L

    /** When the last frame of the given read was really captured. */
    fun capturedAt(read: Int): Long = capturedAtFrame(framesAfter(read))

    fun readEnd(read: Int): Long = capturedAt(read) + latencyNanos

    /** The anchor the hardware gives after the given read, stamped [lateNanos] late. */
    fun anchor(read: Int, lateNanos: Long = 0): FrameAnchor {
      val position = framesAfter(read) + aheadFrames
      return FrameAnchor(position, capturedAtFrame(position) + lateNanos)
    }

    /** The same moment as counted by hardware running at 48 kHz. */
    fun anchorAt48k(read: Int, lateNanos: Long = 0): FrameAnchor =
      FrameAnchor(framesAfter(read) * 48_000L / 44_100L, capturedAt(read) + lateNanos)
  }

  /** A repeatable run of delays between zero and [maxNanos]. */
  private class Jitter(seed: Long, private val maxNanos: Long) {
    private var state = seed

    fun next(): Long {
      state = state * 6364136223846793005L + 1442695040888963407L
      return (state ushr 33) % maxNanos
    }
  }

  private companion object {
    const val BUFFER = 1024
    const val MS = 1_000_000L

    /** 1024 frames at 44.1 kHz, truncated to the nanosecond as the clock does. */
    const val BUFFER_NANOS = 1024L * 1_000_000_000L / 44_100L

    /** Integer division rounds each time once; two of them can differ by this much. */
    const val ROUNDING_NANOS = 2L

    fun assertNanos(expected: Long, actual: Long) {
      assertTrue("expected $expected ns, was $actual ns", abs(expected - actual) <= ROUNDING_NANOS)
    }

    /** One read of a whole buffer, with the anchor a steady device would give. */
    fun CaptureClock.read(stream: Stream, read: Int): BufferTime =
      onRead(BUFFER, stream.readEnd(read), stream.anchor(read))

    /** A clock that has taken sixteen steady reads, so it has adopted the frame clock. */
    fun CaptureClock.adoptedOn(stream: Stream): CaptureClock {
      (1..16).forEach { read -> read(stream, read) }
      return this
    }
  }
}

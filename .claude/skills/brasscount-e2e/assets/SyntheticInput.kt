package com.brasscount.app.audio

import java.io.File
import java.io.IOException
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.random.Random

/**
 * E2E TEST BUILD ONLY. Copied in by the brasscount-e2e skill
 * (`patches.mjs synth on`) and deleted by `patches.mjs synth off`.
 * Never commit this file.
 *
 * Replaces what the microphone heard with a scripted signal, so a run on the
 * emulator (which has no real microphone) hears a beep and shots at known
 * times. The script is the one-line file `files/e2e-synth.txt` in the app's
 * data directory, re-read every 200 ms:
 *
 *   (missing) or `off`             the real microphone, untouched
 *   `silent`                       a -80 dBFS noise floor
 *   `clicks <dBFS> <everyMs>`      the floor plus a 2 ms click every everyMs,
 *                                  the first 300 ms into the capture
 *   `run <beepMs|none> <t1> ...`   the floor until the beep is requested (the
 *                                  first now() call of a capture); then a
 *                                  2 kHz tone at -20 dBFS for 250 ms starting
 *                                  beepMs later, and a -3 dBFS click at each
 *                                  tN ms after the tone starts (after the
 *                                  request when `none`)
 *
 * Events are placed in frame space, counted from the start of the capture,
 * so a click is never split or lost between two buffers however the read
 * times jitter. Times measured by the app therefore match the script to the
 * accuracy of the app's own clock (`frame` exact, `read` within a burst).
 */
internal object SyntheticInput {
  private const val MODE_FILE_NAME = "e2e-synth.txt"
  private const val MODE_REREAD_NANOS = 200_000_000L
  private const val NANOS_PER_MS = 1_000_000L
  private const val FLOOR_AMPLITUDE = 3
  private const val CLICK_FRAMES = 88
  private const val CLICK_DECAY_FRAMES = 20.0
  private const val CLICKS_FIRST_MS = 300L
  private const val BEEP_HZ = 2000.0
  private const val BEEP_DBFS = -20.0
  private const val BEEP_MS = 250L
  private const val RUN_CLICK_DBFS = -3.0
  private const val FULL_SCALE = 32767.0

  private sealed interface Mode {
    data object Off : Mode
    data object Silent : Mode
    data class Clicks(val dbfs: Double, val everyMs: Long) : Mode
    data class Run(val beepDelayMs: Long?, val clickMs: List<Long>) : Mode
  }

  @Volatile private var modeFile: File? = null
  @Volatile private var triggerNanos: Long? = null

  // Capture-thread state, reset by onCaptureStart.
  private var mode: Mode = Mode.Off
  private var modeReadAtNanos: Long? = null
  private var framesSoFar = 0L
  private var lastEndNanos: Long? = null
  private var triggerFrame: Long? = null
  private val random = Random(7)

  fun onCaptureStart(filesDir: File) {
    modeFile = File(filesDir, MODE_FILE_NAME)
    triggerNanos = null
    modeReadAtNanos = null
    framesSoFar = 0L
    lastEndNanos = null
    triggerFrame = null
  }

  /** Called from now(): the first call of a capture is the beep request. */
  fun onNow(nowNanos: Long) {
    if (modeFile != null && triggerNanos == null) {
      triggerNanos = nowNanos
    }
  }

  fun fill(buffer: ShortArray, framesRead: Int, endNanos: Long) {
    refreshMode(endNanos)
    val startFrame = framesSoFar
    placeTrigger(startFrame)
    framesSoFar += framesRead
    lastEndNanos = endNanos

    val current = mode
    if (current == Mode.Off) return
    for (i in 0 until framesRead) {
      val frame = startFrame + i
      val value = floor() + signal(current, frame)
      buffer[i] = value.roundToInt().coerceIn(-32768, 32767).toShort()
    }
  }

  private fun refreshMode(nowNanos: Long) {
    val lastRead = modeReadAtNanos
    if (lastRead != null && nowNanos - lastRead < MODE_REREAD_NANOS) return
    modeReadAtNanos = nowNanos
    val file = modeFile ?: return
    mode =
      try {
        if (file.exists()) parse(file.readText()) else Mode.Off
      } catch (e: IOException) {
        Mode.Off
      }
  }

  /** Turns the trigger's clock time into a frame, off the previous buffer's end. */
  private fun placeTrigger(startFrame: Long) {
    if (triggerFrame != null) return
    val trigger = triggerNanos ?: return
    val previousEnd = lastEndNanos ?: return
    val offsetFrames = (trigger - previousEnd).toDouble() * SAMPLE_RATE_HZ / 1e9
    // May land before this buffer: the request is stamped after the previous
    // buffer was read. The beep and clicks still fall after it.
    triggerFrame = startFrame + offsetFrames.roundToLong()
  }

  private fun parse(text: String): Mode {
    val parts = text.trim().split(Regex("\\s+"))
    return when (parts.firstOrNull()) {
      "silent" -> Mode.Silent
      "clicks" ->
        Mode.Clicks(
          parts.getOrNull(1)?.toDoubleOrNull() ?: RUN_CLICK_DBFS,
          (parts.getOrNull(2)?.toLongOrNull() ?: 500L).coerceAtLeast(100L),
        )
      "run" ->
        Mode.Run(
          parts.getOrNull(1)?.toLongOrNull(),
          parts.drop(2).mapNotNull { it.toLongOrNull() }.sorted(),
        )
      else -> Mode.Off
    }
  }

  private fun floor(): Double = random.nextInt(-FLOOR_AMPLITUDE, FLOOR_AMPLITUDE + 1).toDouble()

  private fun signal(current: Mode, frame: Long): Double =
    when (current) {
      Mode.Off, Mode.Silent -> 0.0
      is Mode.Clicks -> clicksSignal(current, frame)
      is Mode.Run -> runSignal(current, frame)
    }

  private fun clicksSignal(clicks: Mode.Clicks, frame: Long): Double {
    val first = msToFrames(CLICKS_FIRST_MS)
    if (frame < first) return 0.0
    val sinceClick = (frame - first) % msToFrames(clicks.everyMs)
    return click(clicks.dbfs, sinceClick)
  }

  private fun runSignal(run: Mode.Run, frame: Long): Double {
    val trigger = triggerFrame ?: return 0.0
    val beepStart = run.beepDelayMs?.let { trigger + msToFrames(it) }
    var value = 0.0
    if (beepStart != null && frame >= beepStart && frame < beepStart + msToFrames(BEEP_MS)) {
      val t = (frame - beepStart).toDouble() / SAMPLE_RATE_HZ
      value += amplitude(BEEP_DBFS) * sin(2 * PI * BEEP_HZ * t)
    }
    val base = beepStart ?: trigger
    for (ms in run.clickMs) {
      value += click(RUN_CLICK_DBFS, frame - (base + msToFrames(ms)))
    }
    return value
  }

  /** A 2 ms decaying click, [sinceStart] frames after it begins; 0 outside it. */
  private fun click(dbfs: Double, sinceStart: Long): Double {
    if (sinceStart < 0 || sinceStart >= CLICK_FRAMES) return 0.0
    val sign = if (sinceStart % 2 == 0L) 1.0 else -1.0
    return sign * amplitude(dbfs) * exp(-sinceStart / CLICK_DECAY_FRAMES)
  }

  private fun amplitude(dbfs: Double): Double = FULL_SCALE * 10.0.pow(dbfs / 20.0)

  private fun msToFrames(ms: Long): Long = ms * SAMPLE_RATE_HZ / 1000L
}

#!/usr/bin/env node
// Test-only patches for the BrassCount e2e run, applied and removed byte for byte.
//
//   node patches.mjs begin                 record the run's start time (cleanup's cut-off)
//   node patches.mjs synth on|off          synthetic microphone input (native; needs a rebuild)
//   node patches.mjs cleanup on|off        one-shot removal of test drills/sessions (JS; reload)
//   node patches.mjs status                what is applied right now
//   node patches.mjs restore-all           take every patch out (use after an interrupted run)
//
// Run from the BrassCount repo root. Backups and state live in %TEMP%/brasscount-e2e/.
// Every touched file is backed up before the first change and restored from that
// backup, verified by SHA-256, so the user's own uncommitted edits survive.

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = join(tmpdir(), 'brasscount-e2e');
const STATE_FILE = join(STATE_DIR, 'state.json');
const TEST_DRILL_PREFIX = 'ZZE2E';

const AUDIO_DIR = 'android/app/src/main/java/com/brasscount/app/audio';
const MODULE_FILE = `${AUDIO_DIR}/AudioCaptureModule.kt`;
const SYNTH_FILE = `${AUDIO_DIR}/SyntheticInput.kt`;
const APP_FILE = 'App.tsx';
const CLEANUP_FILE = 'src/e2eCleanup.ts';

// Each edit inserts or replaces text at an anchor that must occur exactly once.
const SYNTH_EDITS = [
  {
    anchor: ['      audioRecord = recorder', '      isRunning.set(true)'],
    replacement: [
      '      audioRecord = recorder',
      '      SyntheticInput.onCaptureStart(reactContext.filesDir) // E2E-SYNTH',
      '      isRunning.set(true)',
    ],
  },
  {
    anchor: [
      '  override fun now(): Double = nanosToMillis(SystemClock.elapsedRealtimeNanos())',
    ],
    replacement: [
      '  override fun now(): Double {',
      '    val nowNanos = SystemClock.elapsedRealtimeNanos()',
      '    SyntheticInput.onNow(nowNanos) // E2E-SYNTH',
      '    return nanosToMillis(nowNanos)',
      '  }',
    ],
  },
  {
    anchor: [
      '      emitAmplitude(computeReading(buffer, framesRead, bufferTime.endNanos), bufferTime.frameTimed)',
    ],
    replacement: [
      '      SyntheticInput.fill(buffer, framesRead, bufferTime.endNanos) // E2E-SYNTH',
      '      emitAmplitude(computeReading(buffer, framesRead, bufferTime.endNanos), bufferTime.frameTimed)',
    ],
  },
];

const CLEANUP_EDIT = {
  anchor: ["import { CalibrationProvider } from '@store/CalibrationContext';"],
  replacement: [
    "import { CalibrationProvider } from '@store/CalibrationContext';",
    "import './src/e2eCleanup'; // E2E-CLEANUP",
  ],
};

function fail(message) {
  console.error(`patches: ${message}`);
  process.exit(1);
}

function repoRoot() {
  const root = process.cwd();
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath) || JSON.parse(readFileSync(pkgPath, 'utf8')).name !== 'BrassCount') {
    fail('run this from the BrassCount repo root');
  }
  return root;
}

function loadState() {
  if (!existsSync(STATE_FILE)) return { backups: {} };
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Backs a repo file up once (or notes that it did not exist), before its first change. */
function backUp(state, root, rel) {
  if (state.backups[rel]) return;
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    state.backups[rel] = { existed: false };
    return;
  }
  const backupPath = join(STATE_DIR, 'backup', rel.replace(/[\\/]/g, '__'));
  mkdirSync(dirname(backupPath), { recursive: true });
  copyFileSync(abs, backupPath);
  state.backups[rel] = { existed: true, backupPath, sha256: sha256(abs) };
}

function restore(state, root, rel) {
  const entry = state.backups[rel];
  if (!entry) return `${rel}: not patched`;
  const abs = join(root, rel);
  if (!entry.existed) {
    rmSync(abs, { force: true });
    delete state.backups[rel];
    return `${rel}: removed (did not exist before)`;
  }
  copyFileSync(entry.backupPath, abs);
  const now = sha256(abs);
  if (now !== entry.sha256) fail(`${rel}: restored file does not match its backup hash`);
  delete state.backups[rel];
  return `${rel}: restored byte for byte`;
}

function applyEdits(root, rel, edits) {
  const abs = join(root, rel);
  const text = readFileSync(abs, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let out = text;
  for (const { anchor, replacement } of edits) {
    const from = anchor.join(eol);
    const count = out.split(from).length - 1;
    if (count !== 1) {
      fail(
        `${rel}: anchor found ${count} times, expected once:\n  ${anchor.join('\n  ')}\n` +
          'The file has changed since the skill was written. Apply the same idea by hand ' +
          '(see SKILL.md, "If a patch anchor is missing") and update this script.',
      );
    }
    out = out.replace(from, replacement.join(eol));
  }
  writeFileSync(abs, out);
}

function synth(action) {
  const root = repoRoot();
  const state = loadState();
  if (action === 'on') {
    if (state.backups[MODULE_FILE]) fail('synth is already on');
    backUp(state, root, MODULE_FILE);
    backUp(state, root, SYNTH_FILE);
    saveState(state);
    applyEdits(root, MODULE_FILE, SYNTH_EDITS);
    copyFileSync(join(SKILL_DIR, 'assets', 'SyntheticInput.kt'), join(root, SYNTH_FILE));
    console.log('synth on: patched AudioCaptureModule.kt, added SyntheticInput.kt');
    console.log('Rebuild and reinstall the debug app for it to take effect.');
  } else if (action === 'off') {
    console.log(restore(state, root, MODULE_FILE));
    console.log(restore(state, root, SYNTH_FILE));
    saveState(state);
    console.log('Rebuild and reinstall the debug app to drop the patched native code.');
  } else fail('usage: synth on|off');
}

function cleanup(action) {
  const root = repoRoot();
  const state = loadState();
  if (action === 'on') {
    if (state.backups[APP_FILE]) fail('cleanup is already on');
    if (!state.startedAt) fail('no run start recorded: run `patches.mjs begin` at the start of the e2e run');
    // A minute's margin for the device clock; orphaned sessions older than that are the user's.
    const sinceMs = state.startedAt - 60_000;
    backUp(state, root, APP_FILE);
    backUp(state, root, CLEANUP_FILE);
    saveState(state);
    const template = readFileSync(join(SKILL_DIR, 'assets', 'e2eCleanup.ts.template'), 'utf8');
    writeFileSync(
      join(root, CLEANUP_FILE),
      template.replace('__PREFIX__', TEST_DRILL_PREFIX).replace('__SINCE_MS__', String(sinceMs)),
    );
    applyEdits(root, APP_FILE, [CLEANUP_EDIT]);
    console.log(`cleanup on: removes drills named "${TEST_DRILL_PREFIX}…", their sessions, and orphaned sessions since ${new Date(sinceMs).toISOString()}`);
    console.log('Force-stop and relaunch the app, then read logcat for BRASSCOUNT-E2E.');
  } else if (action === 'off') {
    console.log(restore(state, root, APP_FILE));
    console.log(restore(state, root, CLEANUP_FILE));
    saveState(state);
  } else fail('usage: cleanup on|off');
}

function status() {
  const root = repoRoot();
  const state = loadState();
  const patched = Object.keys(state.backups);
  console.log(`run started: ${state.startedAt ? new Date(state.startedAt).toISOString() : 'not recorded'}`);
  console.log(`patched files: ${patched.length ? patched.join(', ') : 'none'}`);
  const strays = [];
  if (existsSync(join(root, SYNTH_FILE))) strays.push(SYNTH_FILE);
  if (existsSync(join(root, CLEANUP_FILE))) strays.push(CLEANUP_FILE);
  for (const rel of [MODULE_FILE, APP_FILE]) {
    if (/E2E-(SYNTH|CLEANUP)/.test(readFileSync(join(root, rel), 'utf8'))) strays.push(rel);
  }
  console.log(`e2e markers in the tree: ${strays.length ? strays.join(', ') : 'none'}`);
  if (strays.length && !patched.length) {
    console.log('WARNING: markers present but no backups recorded; inspect with git diff and remove by hand.');
  }
}

function restoreAll() {
  const root = repoRoot();
  const state = loadState();
  for (const rel of Object.keys(state.backups)) console.log(restore(state, root, rel));
  saveState(state);
  status();
}

function begin() {
  repoRoot();
  const state = loadState();
  if (Object.keys(state.backups).length) {
    fail('patches from an earlier run are still applied: run `restore-all` first');
  }
  saveState({ backups: {}, startedAt: Date.now() });
  console.log(`e2e run started at ${new Date().toISOString()}`);
}

const [command, arg] = process.argv.slice(2);
switch (command) {
  case 'begin':
    begin();
    break;
  case 'synth':
    synth(arg);
    break;
  case 'cleanup':
    cleanup(arg);
    break;
  case 'status':
    status();
    break;
  case 'restore-all':
    restoreAll();
    break;
  default:
    fail('usage: begin | synth on|off | cleanup on|off | status | restore-all');
}

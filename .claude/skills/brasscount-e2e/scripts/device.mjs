#!/usr/bin/env node
// Emulator and UI driver for the BrassCount e2e run. Calls adb directly (no shell),
// so Git Bash path rewriting never touches device paths.
//
// Emulator
//   emulator start            boot Medium_Phone (or reuse a running emulator) and wait for boot
//   emulator stop             shut down the emulator, only if this run started it (--force: always)
//   metro [port]              is Metro answering on the port (default 8081)?
// App
//   launch | stop-app         start MainActivity / force-stop the app
//   mic grant|revoke          RECORD_AUDIO runtime permission
//   synth <mode...>           write the synthetic-input script (see SyntheticInput.kt):
//                             off | silent | clicks <dBFS> <everyMs> | run <beepMs|none> <t1> <t2> ...
//   foreground                the package and activity on top
// UI (selectors: id=btn-start (default when no prefix), text=Save run, desc=..., contains=...)
//   dump [--all]              compact list of nodes with an id, text or description
//   find <sel>                matching nodes with bounds, enabled, text of descendants
//   text <sel>                text of the first match and its descendants
//   wait <sel> [timeoutMs]    wait until a node matches (default 10000)
//   gone <sel> [timeoutMs]    wait until nothing matches
//   tap <sel> [timeoutMs]     wait for a node, then tap its centre
//   tap-xy <x> <y>            tap a point (the UI cannot be dumped while a run ticks)
//   swipe-left <sel>          swipe a row left 300 px in 300 ms (opens a drill row)
//   swipe-right <sel>         the reverse
//   scroll-down | scroll-up   one screen's worth on the main scroll area
//   type <text>               type into the focused field (single words are reliable)
//   clear-field [n]           move to end and delete n characters (default 80)
//   key <code>                send a key event (111 = Escape closes a sheet; never 4 = Back to hide a keyboard)
//   screenshot <file.png>     save a screenshot (open it with the Read tool to look at it)
// Logs
//   log-clear                 clear logcat
//   log [tag]                 dump ReactNativeJS logs (or the tag given)
//   crashes                   dump the crash buffer and fatal errors since log-clear

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP_ID = 'com.brasscount.app';
const AVD = process.env.BRASSCOUNT_AVD || 'Medium_Phone';
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const STATE_DIR = join(tmpdir(), 'brasscount-e2e');
const DEVICE_STATE = join(STATE_DIR, 'device.json');
const SYNTH_FILE = 'files/e2e-synth.txt';

if (!SDK) fail('ANDROID_HOME is not set');
const exe = process.platform === 'win32' ? '.exe' : '';
const ADB = join(SDK, 'platform-tools', `adb${exe}`);
const EMULATOR = join(SDK, 'emulator', `emulator${exe}`);

function fail(message) {
  console.error(`device: ${message}`);
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function adb(args, { allowFail = false, binary = false, timeout = 60_000 } = {}) {
  try {
    return execFileSync(ADB, args, {
      encoding: binary ? 'buffer' : 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    if (allowFail) return binary ? Buffer.alloc(0) : String(err.stdout || '');
    fail(`adb ${args.join(' ')} failed: ${String(err.stderr || err.message).trim()}`);
  }
}

const shell = (cmd, opts) => adb(['shell', cmd], opts);

function emulatorSerial() {
  const lines = adb(['devices'], { allowFail: true }).split(/\r?\n/);
  const line = lines.find(l => /^emulator-\d+\s+device\b/.test(l));
  return line ? line.split(/\s+/)[0] : null;
}

async function emulatorStart() {
  const running = emulatorSerial();
  if (running) {
    writeFileSync(DEVICE_STATE, JSON.stringify({ startedByUs: false, serial: running }));
    console.log(`reusing running emulator ${running} (it was already up, so stop will leave it running)`);
  } else {
    if (!existsSync(EMULATOR)) fail(`no emulator binary at ${EMULATOR}`);
    mkdirSync(STATE_DIR, { recursive: true });
    const child = spawn(EMULATOR, ['-avd', AVD, '-no-boot-anim'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    writeFileSync(DEVICE_STATE, JSON.stringify({ startedByUs: true }));
    console.log(`starting AVD ${AVD}…`);
  }
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const serial = emulatorSerial();
    if (serial && shell('getprop sys.boot_completed', { allowFail: true }).trim() === '1') {
      console.log(`emulator ${serial} booted`);
      // Keep the screen awake and unlocked for the length of the run.
      shell('svc power stayon true', { allowFail: true });
      shell('wm dismiss-keyguard', { allowFail: true });
      shell('input keyevent 82', { allowFail: true });
      return;
    }
    await sleep(3000);
  }
  fail('emulator did not finish booting within 4 minutes');
}

async function emulatorStop(force) {
  const state = existsSync(DEVICE_STATE) ? JSON.parse(readFileSync(DEVICE_STATE, 'utf8')) : {};
  if (!state.startedByUs && !force) {
    console.log('emulator was already running before this run; left running (pass --force to stop it anyway)');
    return;
  }
  if (!emulatorSerial()) {
    console.log('no emulator running');
    return;
  }
  shell('svc power stayon false', { allowFail: true });
  // A graceful kill: stopping the process abruptly can lose app data written in the session.
  adb(['emu', 'kill'], { allowFail: true });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (!emulatorSerial()) {
      console.log('emulator stopped');
      writeFileSync(DEVICE_STATE, JSON.stringify({ startedByUs: false }));
      return;
    }
    await sleep(2000);
  }
  fail('emulator did not stop within a minute');
}

async function metro(port = '8081') {
  try {
    const res = await fetch(`http://localhost:${port}/status`, { signal: AbortSignal.timeout(3000) });
    const body = await res.text();
    console.log(body.includes('packager-status:running') ? `metro running on ${port}` : `port ${port} answered: ${body.slice(0, 80)}`);
  } catch {
    console.log(`metro not running on ${port}`);
    process.exitCode = 2;
  }
}

// ---- UI hierarchy -------------------------------------------------------

const decode = s =>
  s
    .replace(/&#10;/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

function parseTree(xml) {
  const root = { attrs: {}, children: [], parent: null };
  let current = root;
  const all = [];
  const tagRe = /<node\b([^>]*?)(\/?)>|<\/node>/g;
  let m;
  while ((m = tagRe.exec(xml))) {
    if (m[0] === '</node>') {
      current = current.parent || root;
      continue;
    }
    const attrs = {};
    for (const a of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = decode(a[2]);
    const node = { attrs, children: [], parent: current };
    current.children.push(node);
    all.push(node);
    if (m[2] !== '/') current = node;
  }
  return all;
}

function dumpXml() {
  const out = adb(['exec-out', 'uiautomator', 'dump', '/dev/tty'], { allowFail: true, timeout: 30_000 });
  const start = out.indexOf('<?xml');
  const end = out.lastIndexOf('</hierarchy>');
  if (start < 0 || end < 0) return null;
  return out.slice(start, end + '</hierarchy>'.length);
}

function nodes() {
  const xml = dumpXml();
  if (!xml) return null;
  return parseTree(xml);
}

function matcher(selector) {
  const eq = selector.indexOf('=');
  const [kind, value] = eq > 0 ? [selector.slice(0, eq), selector.slice(eq + 1)] : ['id', selector];
  switch (kind) {
    case 'id':
      return n => n.attrs['resource-id'] === value;
    case 'text':
      return n => n.attrs.text === value;
    case 'desc':
      return n => n.attrs['content-desc'] === value;
    case 'contains':
      return n => (n.attrs.text || '').includes(value) || (n.attrs['content-desc'] || '').includes(value);
    default:
      fail(`unknown selector kind "${kind}" (use id=, text=, desc=, contains=)`);
  }
}

const bounds = n => {
  const m = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(n.attrs.bounds || '');
  return m ? m.slice(1).map(Number) : null;
};

function deepText(n) {
  const own = [n.attrs.text, n.attrs['content-desc']].filter(Boolean);
  return own.concat(n.children.flatMap(deepText));
}

function describe(n) {
  const b = n.attrs.bounds || '';
  const flags = [n.attrs.enabled === 'false' ? 'DISABLED' : '', n.attrs.checked === 'true' ? 'checked' : '', n.attrs.selected === 'true' ? 'selected' : '']
    .filter(Boolean)
    .join(',');
  const id = n.attrs['resource-id'] ? `#${n.attrs['resource-id']}` : '';
  const texts = deepText(n).join(' | ');
  return `${id} ${b}${flags ? ` [${flags}]` : ''} ${JSON.stringify(texts)}`.trim();
}

async function waitFor(selector, timeoutMs = 10_000, wantGone = false) {
  const match = matcher(selector);
  const deadline = Date.now() + Number(timeoutMs);
  let sawDump = false;
  do {
    const all = nodes();
    if (all) {
      sawDump = true;
      const found = all.filter(match);
      if (wantGone ? found.length === 0 : found.length > 0) return found;
    }
    await sleep(600);
  } while (Date.now() < deadline);
  if (!sawDump) fail(`no UI dump in ${timeoutMs} ms (the UI is never idle while a run ticks: use tap-xy)`);
  fail(wantGone ? `"${selector}" still on screen after ${timeoutMs} ms` : `"${selector}" not found within ${timeoutMs} ms`);
}

function tapNode(n) {
  const b = bounds(n);
  if (!b) fail('node has no bounds');
  const [x, y] = [Math.round((b[0] + b[2]) / 2), Math.round((b[1] + b[3]) / 2)];
  shell(`input tap ${x} ${y}`);
  return [x, y];
}

function swipe(n, direction) {
  const b = bounds(n);
  const y = Math.round((b[1] + b[3]) / 2);
  const right = b[2] - 60;
  const [x1, x2] = direction === 'left' ? [right, right - 300] : [b[0] + 60, b[0] + 360];
  shell(`input swipe ${x1} ${y} ${x2} ${y} 300`);
}

function typeText(text) {
  if (!/^[\w.@-]*$/.test(text.replace(/ /g, ''))) fail('type: letters, digits and . @ - _ only');
  if (text.includes(' ')) console.log('note: spaces go through %s and the keyboard may autocorrect the word before them');
  shell(`input text ${JSON.stringify(text.replace(/ /g, '%s'))}`);
}

// ---- commands -----------------------------------------------------------

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'emulator':
    if (args[0] === 'start') await emulatorStart();
    else if (args[0] === 'stop') await emulatorStop(args.includes('--force'));
    else fail('usage: emulator start|stop [--force]');
    break;
  case 'metro':
    await metro(args[0]);
    break;
  case 'launch':
    shell(`am start -n ${APP_ID}/.MainActivity`);
    console.log('launched');
    break;
  case 'stop-app':
    shell(`am force-stop ${APP_ID}`);
    console.log('force-stopped');
    break;
  case 'mic': {
    const verb = args[0] === 'grant' ? 'grant' : args[0] === 'revoke' ? 'revoke' : fail('usage: mic grant|revoke');
    shell(`pm ${verb} ${APP_ID} android.permission.RECORD_AUDIO`, { allowFail: true });
    // A revoked permission is otherwise remembered as "denied twice" across runs.
    if (verb === 'revoke') shell(`pm clear-permission-flags ${APP_ID} android.permission.RECORD_AUDIO user-set user-fixed`, { allowFail: true });
    console.log(`microphone ${verb}ed`);
    break;
  }
  case 'synth': {
    const mode = args.join(' ').trim() || 'off';
    if (!/^(off|silent|clicks( -?\d+(\.\d+)?)?( \d+)?|run (\d+|none)( \d+)*)$/.test(mode)) {
      fail('synth: off | silent | clicks <dBFS> <everyMs> | run <beepMs|none> <t1> <t2> ...');
    }
    shell(`run-as ${APP_ID} sh -c 'mkdir -p files && echo ${mode} > ${SYNTH_FILE}'`);
    const back = shell(`run-as ${APP_ID} cat ${SYNTH_FILE}`, { allowFail: true }).trim();
    if (back !== mode) fail(`synth file reads "${back}", expected "${mode}"`);
    console.log(`synth: ${mode} (takes effect within 200 ms in an open capture)`);
    break;
  }
  case 'foreground':
    console.log(shell('dumpsys activity activities', { allowFail: true }).split(/\r?\n/).filter(l => /mResumedActivity|topResumedActivity/.test(l)).join('\n').trim());
    break;
  case 'dump': {
    const all = nodes();
    if (!all) fail('no UI dump (the UI is never idle while a run ticks: use tap-xy)');
    for (const n of all) {
      const interesting = n.attrs['resource-id'] || n.attrs.text || n.attrs['content-desc'];
      if (args.includes('--all') || interesting) {
        const id = n.attrs['resource-id'] ? `#${n.attrs['resource-id']}` : '';
        const t = [n.attrs.text, n.attrs['content-desc']].filter(Boolean).map(s => JSON.stringify(s)).join(' ');
        console.log(`${id} ${t} ${n.attrs.bounds}${n.attrs.enabled === 'false' ? ' [DISABLED]' : ''}`.trim());
      }
    }
    break;
  }
  case 'find': {
    const found = await waitFor(args[0], args[1] || 3000);
    for (const n of found) console.log(describe(n));
    break;
  }
  case 'text': {
    const [n] = await waitFor(args[0], args[1] || 5000);
    console.log(deepText(n).join(' | '));
    break;
  }
  case 'wait':
    console.log(describe((await waitFor(args[0], args[1]))[0]));
    break;
  case 'gone':
    await waitFor(args[0], args[1], true);
    console.log(`"${args[0]}" gone`);
    break;
  case 'tap': {
    const [n] = await waitFor(args[0], args[1]);
    if (n.attrs.enabled === 'false') console.log(`warning: "${args[0]}" is DISABLED; tapping anyway`);
    const [x, y] = tapNode(n);
    console.log(`tapped ${args[0]} at ${x},${y}`);
    break;
  }
  case 'tap-xy':
    shell(`input tap ${Number(args[0])} ${Number(args[1])}`);
    console.log(`tapped ${args[0]},${args[1]}`);
    break;
  case 'swipe-left':
  case 'swipe-right': {
    const [n] = await waitFor(args[0]);
    swipe(n, command === 'swipe-left' ? 'left' : 'right');
    console.log(`${command} ${args[0]}`);
    break;
  }
  case 'scroll-down':
  case 'scroll-up':
    shell(command === 'scroll-down' ? 'input swipe 540 1700 540 700 400' : 'input swipe 540 700 540 1700 400');
    console.log(command);
    break;
  case 'type':
    typeText(args.join(' '));
    console.log('typed');
    break;
  case 'clear-field': {
    const count = Number(args[0] || 80);
    shell(`input keyevent 123 ${Array(count).fill(67).join(' ')}`);
    console.log(`cleared up to ${count} characters`);
    break;
  }
  case 'key':
    if (args[0] === '4') console.log('warning: Back pops the screen; it does not hide the keyboard here');
    shell(`input keyevent ${Number(args[0])}`);
    console.log(`key ${args[0]}`);
    break;
  case 'screenshot': {
    if (!args[0]) fail('usage: screenshot <file.png>');
    writeFileSync(args[0], adb(['exec-out', 'screencap', '-p'], { binary: true }));
    console.log(`saved ${args[0]}`);
    break;
  }
  case 'log-clear':
    adb(['logcat', '-c'], { allowFail: true });
    adb(['logcat', '-b', 'crash', '-c'], { allowFail: true });
    console.log('logcat cleared');
    break;
  case 'log':
    console.log(adb(['logcat', '-d', '-s', `${args[0] || 'ReactNativeJS'}:V`], { allowFail: true }).trim());
    break;
  case 'crashes': {
    const crash = adb(['logcat', '-d', '-b', 'crash'], { allowFail: true }).trim();
    const fatal = adb(['logcat', '-d', '*:E'], { allowFail: true })
      .split(/\r?\n/)
      .filter(l => /FATAL|AndroidRuntime|ReactNativeJS|Unhandled|TypeError|ReferenceError|Invariant/.test(l))
      .join('\n')
      .trim();
    console.log(crash || fatal ? `${crash}\n${fatal}`.trim() : 'no crashes or JS errors logged');
    if (crash || fatal) process.exitCode = 3;
    break;
  }
  default:
    fail('unknown command; see the header of device.mjs for the list');
}

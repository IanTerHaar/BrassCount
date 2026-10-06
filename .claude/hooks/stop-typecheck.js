/**
 * Stop hook.
 *
 * Runs the project type check (`npm run typecheck` → `tsc --noEmit`) before
 * Claude ends a turn, but only when the working tree has TypeScript changes —
 * a whole-project `tsc` is too slow to run after every single edit.
 *
 * Exit 2 feeds the compiler errors back to Claude and keeps the turn going.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TSC = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const MAX_OUTPUT_CHARS = 6000;

const readStdin = () => {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
};

const hasTypeScriptChanges = () => {
  const status = spawnSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (status.status !== 0) {
    return false;
  }
  return status.stdout
    .split('\n')
    .some(line => /\.tsx?"?$/.test(line.trim()) || /tsconfig\.json/.test(line));
};

const main = () => {
  const input = readStdin();
  // Already continuing because of this hook — don't loop forever.
  if (input.stop_hook_active === true) {
    return 0;
  }
  if (!fs.existsSync(TSC) || !hasTypeScriptChanges()) {
    return 0;
  }

  const result = spawnSync(process.execPath, [TSC, '--noEmit'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status === 0) {
    return 0;
  }

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  process.stderr.write(
    `npm run typecheck failed — fix these before finishing:\n${output.slice(
      0,
      MAX_OUTPUT_CHARS,
    )}\n`,
  );
  return 2;
};

process.exit(main());

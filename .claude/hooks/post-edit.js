/**
 * PostToolUse hook (Edit|Write).
 *
 * Mirrors the lint-staged pre-commit pipeline from `.lintstagedrc.js` on the
 * single file Claude just touched, so problems surface at edit time instead
 * of at commit time:
 *   - `*.{ts,tsx,js,jsx}`       → eslint --fix --max-warnings=0, then prettier --write
 *   - `*.{json,md,yml,yaml}`    → prettier --write
 *
 * Exit 2 feeds stderr back to Claude as a blocking error; exit 0 is silent.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ESLINT = path.join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
const PRETTIER = path.join(
  ROOT,
  'node_modules',
  'prettier',
  'bin',
  'prettier.cjs',
);

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const FORMAT_ONLY_EXTENSIONS = new Set(['.json', '.md', '.yml', '.yaml']);

// Keep in sync with `.prettierignore` / the ESLint ignore list.
const SKIPPED_DIRS = ['node_modules', 'android', 'ios', 'coverage', '.git'];

// Root config files ESLint ignores — same list as `.lintstagedrc.js`.
const ESLINT_IGNORE_BASENAMES = new Set([
  'babel.config.js',
  'metro.config.js',
  'jest.config.js',
  'jest.setup.js',
  '.eslintrc.js',
  '.prettierrc.js',
  '.lintstagedrc.js',
  'eslint.config.js',
]);

const readStdin = () => {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
};

const runNode = (script, args) =>
  spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });

const outputOf = result =>
  `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();

const main = () => {
  const input = readStdin();
  const rawPath = input.tool_response?.filePath ?? input.tool_input?.file_path;
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    return 0;
  }

  const file = path.resolve(ROOT, rawPath);
  const relative = path.relative(ROOT, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return 0;
  }
  if (SKIPPED_DIRS.includes(relative.split(path.sep)[0])) {
    return 0;
  }
  if (!fs.existsSync(file) || !fs.existsSync(PRETTIER)) {
    return 0;
  }

  const extension = path.extname(file).toLowerCase();
  const isCode = CODE_EXTENSIONS.has(extension);
  if (!isCode && !FORMAT_ONLY_EXTENSIONS.has(extension)) {
    return 0;
  }

  const problems = [];

  if (isCode && !ESLINT_IGNORE_BASENAMES.has(path.basename(file))) {
    const lint = runNode(ESLINT, ['--fix', '--max-warnings=0', file]);
    if (lint.status !== 0) {
      problems.push(
        `ESLint (--max-warnings=0) failed for ${relative}:\n${outputOf(lint)}`,
      );
    }
  }

  const format = runNode(PRETTIER, ['--write', '--log-level=warn', file]);
  if (format.status !== 0) {
    problems.push(`Prettier failed for ${relative}:\n${outputOf(format)}`);
  }

  if (problems.length > 0) {
    process.stderr.write(`${problems.join('\n\n')}\n`);
    return 2;
  }
  return 0;
};

process.exit(main());

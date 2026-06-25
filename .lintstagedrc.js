/**
 * Filter ESLint-ignored config files out of the eslint command so the
 * `--max-warnings=0` gate doesn't trip on "file ignored" warnings emitted
 * by ESLint v8 when it's handed an ignored path explicitly.
 */
const path = require('path');

const ESLINT_IGNORE_BASENAMES = new Set([
  'babel.config.js',
  'metro.config.js',
  'jest.config.js',
  'jest.setup.js',
  '.eslintrc.js',
  '.prettierrc.js',
  '.lintstagedrc.js',
]);

const isLintable = file => !ESLINT_IGNORE_BASENAMES.has(path.basename(file));

module.exports = {
  '*.{ts,tsx,js,jsx}': files => {
    const lintable = files.filter(isLintable);
    const commands = [];
    if (lintable.length > 0) {
      commands.push(
        `eslint --fix --max-warnings=0 ${lintable
          .map(f => `"${f}"`)
          .join(' ')}`,
      );
    }
    commands.push(`prettier --write ${files.map(f => `"${f}"`).join(' ')}`);
    return commands;
  },
  '*.{json,md,yml,yaml}': files =>
    `prettier --write ${files.map(f => `"${f}"`).join(' ')}`,
};

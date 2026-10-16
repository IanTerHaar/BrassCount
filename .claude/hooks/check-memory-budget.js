/**
 * Memory budget check.
 *
 * `.claude/CLAUDE.md` and every file under `.claude/rules/` are loaded into
 * Claude's context, so each file has a size cap. Run standalone
 * (`npm run check:memory`, and in CI) it exits 1 when a file is over budget;
 * the Stop hook requires it and feeds the message back to Claude.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CLAUDE_DIR = path.join(ROOT, '.claude');

const CLAUDE_MD_MAX_BYTES = 8 * 1024;
const RULE_MAX_BYTES = 6 * 1024;

const ADVICE =
  'Memory files are loaded into every session. Do not add behaviour ' +
  'descriptions here: move feature detail into a path-scoped rule under ' +
  '.claude/rules/ or a header comment in the code, and keep CLAUDE.md to ' +
  "commands, invariants and gotchas that can't be derived from the code.";

const listRuleFiles = dir => {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listRuleFiles(full);
    }
    return entry.name.endsWith('.md') ? [full] : [];
  });
};

const findOverBudget = () => {
  const targets = [
    { file: path.join(CLAUDE_DIR, 'CLAUDE.md'), max: CLAUDE_MD_MAX_BYTES },
    ...listRuleFiles(path.join(CLAUDE_DIR, 'rules')).map(file => ({
      file,
      max: RULE_MAX_BYTES,
    })),
  ];
  return targets
    .filter(({ file }) => fs.existsSync(file))
    .map(({ file, max }) => ({ file, max, size: fs.statSync(file).size }))
    .filter(({ size, max }) => size > max);
};

const describeOverBudget = () => {
  const over = findOverBudget();
  if (over.length === 0) {
    return null;
  }
  const lines = over.map(
    ({ file, max, size }) =>
      `  ${path.relative(ROOT, file)}: ${size} bytes, budget ${max}`,
  );
  return `Memory file over budget:\n${lines.join('\n')}\n${ADVICE}`;
};

module.exports = { describeOverBudget };

if (require.main === module) {
  const message = describeOverBudget();
  if (message) {
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

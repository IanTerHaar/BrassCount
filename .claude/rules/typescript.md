---
paths:
  - 'src/**/*.ts'
  - 'src/**/*.tsx'
  - '__tests__/**/*.ts'
  - '__tests__/**/*.tsx'
---

# TypeScript & Import Rules

- Use `@/...` path aliases for all internal cross-module imports (`@components`, `@screens`, `@navigation`, `@hooks`, `@utils`, `@constants`, `@types`, `@services`, `@theme`), not relative `../../` paths that cross a top-level `src/` directory. Adding a new alias means updating `babel.config.js`, `tsconfig.json`, and `jest.config.js` together.
- Order imports as: builtins, then external packages (React and React Native first), then internal `@/...` aliases, then parent/sibling/index — alphabetized within each group, matching `eslint-plugin-import`'s `import/order` config. Run `npm run lint:fix` rather than hand-ordering.
- Use `import type { ... }` for type-only imports.
- Don't import `@env` in new code — `react-native-dotenv` is wired up but unused; treat it as scaffolding, not an established pattern to extend.
- Zero ESLint warnings is enforced (`--max-warnings=0`); don't leave a warning-level lint issue unresolved because it "still passes."

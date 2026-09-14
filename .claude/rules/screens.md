---
paths:
  - 'src/screens/**/*.tsx'
---

# Screen Rules

See `.claude/rules/components.md` for shared UI rules (Typography, theming, styling) that also apply to screens.

- A screen reads/writes persisted data through a domain service in `services/` (e.g. `sessionStorage.ts`), never through AsyncStorage directly.
- Navigate using the typed param lists from `src/types/navigation.ts` — don't pass ad-hoc/untyped params through `navigation.navigate`.

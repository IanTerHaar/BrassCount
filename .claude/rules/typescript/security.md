---
paths:
  - '**/*.ts'
  - '**/*.tsx'
  - '**/*.js'
  - '**/*.jsx'
---

# TypeScript/JavaScript Security

> This file extends [common/security.md](../common/security.md) with TypeScript/JavaScript specific content.

## Configuration, Not Secrets

There is no `process.env` at runtime in React Native. Build-time values come from `.env` through `react-native-dotenv`, and they are compiled into the bundle in plain text.

```typescript
// NEVER: a real secret in source
const apiKey = 'sk-proj-xxxxx';

// OK for public configuration only — this value ships inside the APK
import { API_BASE_URL } from '@env';

if (!API_BASE_URL) {
  throw new Error('API_BASE_URL is not configured');
}
```

Using `@env` for the first time requires the two files its aliases point at: a type declaration at `src/types/env.d.ts` and a Jest mock at `__mocks__/@env.js`. Add every new variable to `.env.example` as well.

## Dynamic Code and Parsing

- Never use `eval` or `new Function`.
- `JSON.parse` only inside the storage layer, always in a `try`/`catch`.
- Never spread an untrusted parsed object straight into state or a stored record — pick the known fields.

## Tooling Scripts

The scripts in `.claude/hooks/` run on every edit with the developer's permissions. Keep them free of network calls and shell string interpolation: spawn executables with an argument array.

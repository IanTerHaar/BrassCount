---
paths:
  - '**/*.ts'
  - '**/*.tsx'
  - '**/*.js'
  - '**/*.jsx'
---

# TypeScript/JavaScript Testing

> This file extends [common/testing.md](../common/testing.md) with TypeScript/JavaScript specific content.

## Typing Tests

- Test files are type-checked by `npm run typecheck` (`tsconfig.json` includes `**/*.ts(x)` with Jest types), so a type error in a test fails CI.
- Type fakes against the real interface so they break when the contract changes:

```typescript
const createFakeNamespace = (): jest.Mocked<StorageNamespace<Session>> => ({
  prefix: '@BrassCount:sessions:v1',
  keyFor: jest.fn(id => `@BrassCount:sessions:v1:${id}`),
  setItem: jest.fn(async () => {}),
  getItem: jest.fn(async () => null),
  removeItem: jest.fn(async () => {}),
  getAllIds: jest.fn(async () => []),
  getAll: jest.fn(async () => []),
  clear: jest.fn(async () => {}),
});
```

- Cast a mocked function with `as jest.Mock` (or `jest.mocked(fn)`) rather than `as any`.

## Async Assertions

- `await expect(promise).resolves…` / `.rejects.toBeInstanceOf(StorageError)` — always awaited, or the assertion is skipped.
- Assert on the error class, not on message text.

## End-to-End

No E2E framework is installed. Do not add one (or write tests that assume one) without the user deciding to.

# Testing Requirements

## Stack

- **Jest 29** with the `@react-native/jest-preset` preset; tests live in `__tests__/` at the repo root as `*.test.ts` / `*.test.tsx`
- **react-test-renderer** for component tests
- No end-to-end framework is set up. Verify UI and native behaviour by running the app.

```bash
npm test                    # all tests, single run
npm test -- sessionStorage  # one file (path pattern)
npm test -- -t "sorts"      # tests matching a name
npm run test:ci             # with coverage, as CI runs it
```

## Coverage

`npm run test:ci` reports coverage for `src/**/*.{ts,tsx}` (excluding `*.d.ts` and `index.ts`). No threshold is enforced in `jest.config.js`; aim for 80%+ on new logic in `src/services`, `src/utils` and `src/hooks`, and cover the main interactions of a screen you change.

## Test-Driven Development

1. Write the test first (RED)
2. Run it — it should FAIL
3. Write the minimal implementation (GREEN)
4. Run it — it should PASS
5. Refactor (IMPROVE)

## What to Test

| Code                        | How                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `src/utils`                 | Pure-function unit tests                                                                |
| `src/services`              | Against the global AsyncStorage in-memory mock; inject fakes through the options object |
| `src/hooks`                 | Through a small test component rendered with `react-test-renderer`                      |
| `src/screens`, `components` | Render, drive with `act`, assert on what the user sees                                  |

## Conventions

- Global mocks belong in `jest.setup.js` (AsyncStorage's official in-memory mock and gesture-handler are already there). A new native module needs a mock there before any test can import it.
- Prefer hand-written fakes passed through a service's options over `jest.mock` of a module.
- Clear shared state between tests (`clearSessions()` or `AsyncStorage.clear()` in `beforeEach`).
- For anything time-based use `jest.useFakeTimers()` with `jest.setSystemTime()`, and restore real timers in `afterEach`.
- Tests import with relative paths (`../src/...`).

## Troubleshooting Failures

1. Check test isolation — leaked storage or timers from an earlier test
2. Verify mocks and fakes match the real interface
3. Fix the implementation, not the test (unless the test is wrong)

## Structure (Arrange-Act-Assert)

```typescript
it('returns sessions newest first', async () => {
  // Arrange
  await saveSession({ id: 'a', name: 'First' });
  await saveSession({ id: 'b', name: 'Second' });

  // Act
  const sessions = await loadSessions();

  // Assert
  expect(sessions.map(session => session.id)).toEqual(['b', 'a']);
});
```

## Naming

Name the behaviour, not the function:

```typescript
it('resolves to null when the stored value is corrupt', () => {});
it('preserves createdAt when saving an existing session', () => {});
it('throws StorageError when the id is empty', () => {});
```

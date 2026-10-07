---
paths:
  - '**/*.ts'
  - '**/*.tsx'
---

# React Native Testing

> This file extends [common/testing.md](../common/testing.md) with React Native specific content.

## Tooling

| Layer            | Tool                                                            |
| ---------------- | --------------------------------------------------------------- |
| Unit / component | Jest 29 + `react-test-renderer` via `@react-native/jest-preset` |
| Type safety      | `npm run typecheck` (also a CI job)                             |
| E2E              | None set up — verify on a device                                |

`@testing-library/react-native` is not installed; write component tests with `react-test-renderer` unless the user decides to add it.

## Component Tests

- Wrap the tree in `SafeAreaProvider` with `initialMetrics` — `Screen` and `TabBar` read insets and render nothing useful without them.
- Create and update inside `act`; await async work with `await act(async () => { … })`.
- Find elements by the `testID`s the components expose (`btn-start`, `text-elapsed`, `tab-Timer`), using `findAllByProps({ testID })[0]` — a `testID` is forwarded through several nested elements, so `findByProps` throws on the duplicate matches — then assert on what the user would see or hear announced: text content, `accessibilityLabel`, `accessibilityState`.
- Assert on behaviour, not implementation details such as internal state or style objects.

```tsx
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderScreen = (): ReactTestRenderer => {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ProfileScreen />
      </SafeAreaProvider>,
    );
  });
  return tree as ReactTestRenderer;
};

it('renders the profile screen', () => {
  const tree = renderScreen();

  expect(
    tree.root.findAllByProps({ testID: 'screen-profile' }),
  ).not.toHaveLength(0);
});
```

## Mocking

- Native modules are mocked globally in `jest.setup.js`. Add the library's official Jest mock there when introducing a native dependency.
- Screens that call `useNavigation` / `useRoute` need either a `NavigationContainer` wrapper or a mock of those hooks.
- To isolate a screen from a service, mock only the service handle's methods and keep the rest of the module real (`jest.requireActual`), so error classes still match `instanceof` checks.
- Add any new ESM-only dependency to `transformIgnorePatterns` in `jest.config.js`.

## Timers

- Use `jest.useFakeTimers()` and `jest.setSystemTime()` for anything involving delays, intervals or elapsed time.
- Advance with `await jest.advanceTimersByTimeAsync(ms)` so pending promises settle, and wrap it in `act` when a component is mounted.

## What to Test First

Write the failing test that captures the behaviour, then implement — see the TDD steps in common/testing.md.

---
paths:
  - '**/*.ts'
  - '**/*.tsx'
---

# React Native Patterns

> This file extends [common/patterns.md](../common/patterns.md) with React Native specific patterns.
> Web/React-DOM patterns (URL-as-state, `<div>`, browser storage) do not apply here.

## Navigation (React Navigation 7)

- The tree is a root native stack containing the bottom tabs plus full-screen routes pushed over them; the History tab is a nested stack so the tab bar stays visible on its detail screen.
- Every route and its params are declared in `src/types/navigation.ts`. Add the route there first, then register the screen in the navigator, then export it from `src/screens/index.ts`.
- A screen that should keep the tab bar goes in a stack nested inside the tab; a screen that should cover it goes on the root stack.
- Screens take no props: read navigation and params with typed `useNavigation<Nav>()` / `useRoute<…>()`.
- Navigator headers are off. Each screen renders its header through `Screen` (`title`, `subtitle`, `onBack={navigation.goBack}`).
- A new tab also needs an icon entry in `tabIcons` in `TabBar.tsx`.
- Pass ids through params and load the record in the destination screen; do not pass whole objects.

```tsx
type HistoryDetailRoute = RouteProp<HistoryStackParamList, 'HistoryDetail'>;

export const HistoryDetailScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<HistoryDetailRoute>();
  const { drillId, drillName } = route.params;
  return (
    <Screen title={drillName} onBack={navigation.goBack} scrollable>
      …
    </Screen>
  );
};
```

## State Management

There is no state library and no backend. Keep each concern in its own place:

| Concern            | Where it lives                                                |
| ------------------ | ------------------------------------------------------------- |
| UI / screen state  | Local `useState` / `useRef` in the screen                     |
| Navigation state   | React Navigation params (not a store)                         |
| Persisted data     | A service in `src/services/` built on a storage namespace     |
| Design tokens      | `useTheme()` / `useThemedStyles()`                            |
| Temporary fixtures | `src/constants/previewData.ts` (to be replaced, then deleted) |

- Derive values during render instead of storing redundant computed state.
- Prefer local state until two screens genuinely need to share it; raise it with the user before introducing a store or context.
- Use a ref, not state, for values that must not trigger a render (timer origin timestamps, abort controllers, run counters).

## Loading Persisted Data

- Load inside an effect (or `useFocusEffect` when the list must refresh on return), and ignore results that arrive after unmount or after a newer request.
- Handle the three states explicitly in the UI: loading, error (`StorageError`), and empty (`EmptyState`).
- After a write, update local state from the value the service returns rather than re-reading.

## Lists

- Use `FlatList` / `SectionList` for data that can grow (history, sessions) — do not `.map()` an unbounded array inside a `ScrollView`.
- Provide a stable `keyExtractor` based on ids; memoize `renderItem`.
- `.map()` inside a `Card` is fine for short, bounded lists such as the steps of one drill.

## Custom Hooks

- Extract reusable logic (data loading, timers, permissions, device APIs) into `use*` hooks in `src/hooks/`.
- Keep side effects inside hooks and services, not in JSX.

## Async & Effects

- Clean up timers, intervals, listeners and subscriptions in the effect's return function.
- Make cancellable work accept an `AbortSignal`, and abort it on unmount.
- Guard against stale async results with a run counter or an `active` flag before calling `setState`.
- Measure elapsed time from a captured timestamp (`Date.now() - origin`), never by counting interval ticks.

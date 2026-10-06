---
name: react-native-patterns
description: How to build BrassCount screens, components, hooks, navigation and services the way the codebase already does — bare React Native 0.86 (no Expo), React Navigation 7, theme tokens with useThemedStyles, the Screen shell and UI primitives, AsyncStorage-backed service modules, timers and cancellable async work, and react-test-renderer tests. Use when adding or editing anything under src/ or __tests__/.
---

# BrassCount React Native Patterns

Worked examples for the conventions in `.claude/rules/`: the rules say _what_ to enforce, this skill shows _how_. Everything here matches code already in the repo — copy the shape, not a different stack.

This is a bare React Native CLI app, Android only, on the New Architecture. There is no Expo, no state-management library, no data-fetching library, no schema-validation library and no backend. Do not introduce Expo modules, NativeWind, TanStack Query, Zustand or Zod as part of unrelated work.

## When to Activate

- Adding or changing a screen, component or custom hook
- Adding a route or tab
- Adding a service or persisting a new kind of data
- Replacing `preview*` fixtures with real data
- Writing timer, interval or other cancellable async logic
- Writing tests for any of the above

## Where Things Go

```
src/
  components/   UI primitives (Screen, Card, ListRow, Chip, Typography, Icon, …)
  screens/      One file per screen, exported from screens/index.ts
  navigation/   RootNavigator → MainTabs (+ HistoryStack), custom TabBar
  services/     Persistence and device logic; the only place AsyncStorage is used
  hooks/        useTheme, useThemedStyles, other reusable use* hooks
  utils/        Pure helpers (format, id, timestamp)
  types/        Domain and navigation types
  theme/        Palette and semantic tokens
  constants/    previewData.ts — temporary fixtures
__tests__/      All Jest tests
```

## A Screen

A screen composes the `Screen` shell and primitives, takes no props, and reads navigation through typed hooks.

```tsx
import { StyleSheet, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { Theme } from '@/theme/theme';
import type { RootStackParamList } from '@/types/navigation';
import { Card } from '@components/Card';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { useThemedStyles } from '@hooks/useTheme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    actions: { flexDirection: 'row', gap: theme.spacing.sm },
  });

export const DrillsScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();

  return (
    <Screen title="Drills" scrollable testID="screen-drills">
      <View>
        <SectionHeader title="Your drills" />
        <Card flush>{/* rows */}</Card>
      </View>
    </Screen>
  );
};
```

Check the props of a primitive in `src/components/` before using it — the example above shows the composition, not every prop.

Key points:

- `createStyles` is at module scope; `useThemedStyles` memoizes on the theme.
- Tokens only: `theme.spacing.*`, `theme.radius.*`, `theme.colors.*`, `Typography` variants.
- `Screen` owns the safe area, padding, header and tab-bar clearance. Pass `scrollable` for anything that can overflow and `onBack={navigation.goBack}` for pushed screens.
- Every screen and interactive element gets a `testID` (`screen-…`, `btn-…`, `row-…-<id>`).

## Adding a Route

1. Declare it in `src/types/navigation.ts`:

   ```ts
   export type RootStackParamList = {
     Tabs: NavigatorScreenParams<MainTabParamList>;
     SequenceEditor: { id?: string };
     DrillSettings: { drillId: string };
   };
   ```

2. Register the screen in the right navigator — the root stack to cover the tab bar, a stack nested in a tab to keep it — with `options={{ headerShown: false }}`.
3. Export the screen from `src/screens/index.ts`.
4. A new tab also needs an entry in `tabIcons` in `src/navigation/TabBar.tsx`.

Read params with a typed route:

```tsx
type DetailRoute = RouteProp<HistoryStackParamList, 'HistoryDetail'>;

const route = useRoute<DetailRoute>();
const { drillId, drillName } = route.params;
```

Pass ids, not whole objects.

## A Service on a Storage Namespace

```ts
import type { Drill, DrillInput } from '@/types/drill';
import { getTimestamp } from '@utils/timestamp';

import { createStorageNamespace, StorageError } from './storage';

export const DRILL_NAMESPACE = 'drills';
export const DRILL_STORAGE_VERSION = 'v1';

const drills = createStorageNamespace<Drill>({
  name: DRILL_NAMESPACE,
  version: DRILL_STORAGE_VERSION,
});

export async function saveDrill(input: DrillInput): Promise<Drill> {
  if (!input.id) {
    throw new StorageError('Cannot save drill without a valid id');
  }

  const existing = await drills.getItem(input.id);
  const timestamp = getTimestamp();
  const drill: Drill = {
    ...input,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  await drills.setItem(drill.id, drill);
  return drill;
}

export async function loadDrills(): Promise<Drill[]> {
  const all = await drills.getAll();
  return [...all].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

export const DrillStorageService = {
  namespace: DRILL_NAMESPACE,
  version: DRILL_STORAGE_VERSION,
  save: saveDrill,
  loadAll: loadDrills,
};

export type DrillStorageServiceType = typeof DrillStorageService;
```

Then re-export it from `src/services/index.ts`. `sessionStorage.ts` is the reference implementation.

- Keys are `@BrassCount:<name>:<version>:<id>`, one per item.
- A breaking change to the stored shape needs a `version` bump and a migration.
- Corrupt entries come back as `null` / are skipped; treat everything read from storage as untrusted.

## Loading Persisted Data in a Screen

Handle loading, error and empty explicitly, and ignore a result that arrives after unmount.

```tsx
type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; drills: Drill[] };

export const useDrills = (): LoadState => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    loadDrills().then(
      drills => {
        if (active) {
          setState({ status: 'ready', drills });
        }
      },
      () => {
        if (active) {
          setState({ status: 'error', message: 'Could not load your drills' });
        }
      },
    );

    return () => {
      active = false;
    };
  }, []);

  return state;
};
```

Use `useFocusEffect` instead of `useEffect` when the list must refresh after returning from an editor screen. After a save, update local state from the object the service returns rather than re-reading.

## Replacing Fixtures

`src/constants/previewData.ts` exists only so screens render realistic content. When wiring a screen to real data:

1. Move any type that outlives the fixture (`DrillStep`, `SequenceAction`, …) into `src/types/`.
2. Move pure helpers (`countShots`, `totalParSeconds`, `labelForStep`) into `src/utils/` with their tests.
3. Swap the `preview*` import for the service or hook.
4. Delete the fixture once nothing imports it.

## Timers and Cancellable Work

Elapsed time comes from a timestamp, never from counting ticks.

```tsx
const startedAt = useRef<number | null>(null);
const [elapsed, setElapsed] = useState(0);

useEffect(() => {
  const origin = startedAt.current;
  if (phase !== 'running' || origin === null) {
    return;
  }

  const id = setInterval(() => {
    setElapsed((Date.now() - origin) / 1000);
  }, 50);

  return () => clearInterval(id);
}, [phase]);
```

- Hold the origin, abort controllers and run counters in refs — they must not trigger renders.
- Cancellable service calls take an `AbortSignal`; abort on unmount and on reset.
- Bump a run counter when starting or cancelling, and drop any async result whose run id is no longer current.
- Format with `formatElapsed` / `formatSeconds` from `@utils/format`.

## Lists

`FlatList` for data that can grow; `.map()` only for short bounded lists inside a `Card`.

```tsx
const renderItem = useCallback(
  ({ item }: { item: Session }) => (
    <ListRow title={item.name} testID={`row-session-${item.id}`} />
  ),
  [],
);

<FlatList
  data={sessions}
  keyExtractor={item => item.id}
  renderItem={renderItem}
/>;
```

## A Component Test

```tsx
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Chip } from '../src/components/Chip';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const render = (element: React.ReactElement): ReactTestRenderer => {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>,
    );
  });
  return tree as ReactTestRenderer;
};

it('calls onPress when the chip is pressed', () => {
  const onPress = jest.fn();
  const tree = render(
    <Chip label="El Presidente" onPress={onPress} testID="chip" />,
  );

  act(() => {
    // findAll…[0]: the testID is forwarded through nested elements.
    tree.root.findAllByProps({ testID: 'chip' })[0].props.onPress();
  });

  expect(onPress).toHaveBeenCalledTimes(1);
});
```

Service tests run against the in-memory AsyncStorage mock from `jest.setup.js`; clear it in `beforeEach`. Use fake timers and `jest.setSystemTime` for anything time-based.

## Anti-Patterns

```tsx
// WRONG: raw values and an inline style object
<View style={{ padding: 16, backgroundColor: '#fff' }} />
// RIGHT: createStyles + theme tokens

// WRONG: importing the theme into a component
import { lightTheme } from '@/theme/theme';
// RIGHT: useTheme() / useThemedStyles()

// WRONG: AsyncStorage in a screen
await AsyncStorage.setItem('drills', JSON.stringify(drills));
// RIGHT: a service built on createStorageNamespace

// WRONG: counting ticks
setElapsed(previous => previous + 0.05);
// RIGHT: (Date.now() - origin) / 1000

// WRONG: hand-rolled safe area and header
<SafeAreaView><Text style={{ fontSize: 28 }}>Drills</Text></SafeAreaView>
// RIGHT: <Screen title="Drills">

// WRONG: an unbounded array mapped in a ScrollView
<ScrollView>{history.map(run => <Row key={run.id} run={run} />)}</ScrollView>
// RIGHT: FlatList
```

## Checklist Before Finishing

- [ ] Tokens only — no raw colors, spacing or font sizes
- [ ] New routes typed in `src/types/navigation.ts`
- [ ] Effects clean up; async results guarded against unmount and stale runs
- [ ] Loading, error and empty states rendered
- [ ] `accessibilityRole` / `accessibilityLabel` / `accessibilityState` on controls; `testID`s follow the scheme
- [ ] Tests added in `__tests__/`; `npm run lint`, `npm run typecheck` and `npm test` pass
- [ ] Checked on a device in light and dark themes for UI changes

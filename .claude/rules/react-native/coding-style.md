---
paths:
  - '**/*.ts'
  - '**/*.tsx'
---

# React Native Coding Style

> This file extends [common/coding-style.md](../common/coding-style.md) with React Native specific content.
> This is a bare React Native CLI app (no Expo), Android only.

## Components

- Arrow-function components with a named export: `export const TimerScreen = () => { … }`. Use a `function` declaration only when the component is generic (`Select<T>`). No default exports (except `App`), no class components, no `React.FC`.
- Define props as a named `type` (`type ScreenProps = { … }`), with a JSDoc line on any prop whose purpose is not obvious.
- Keep screens thin: a screen composes hooks, services and the primitives from `src/components/`; it does not hold heavy logic.
- One reusable component per file; co-locate small private subcomponents.
- Give interactive and asserted-on elements a `testID` following the existing scheme: `screen-<name>`, `btn-<action>`, `chip-<kind>-<id>`, `row-<kind>-<index>`, `tab-<Route>`, `text-<name>`.

## Styling

`StyleSheet` with theme tokens is the only styling system.

- Declare `createStyles` at module scope and consume it with `useThemedStyles`; read one-off tokens from `useTheme()`.
- Never hardcode colors, spacing, radii or font sizes — use `theme.colors`, `theme.spacing`, `theme.radius`, `theme.typography`.
- Render text with the `Typography` component and a variant, not a raw `<Text>` with ad hoc styles. Use the mono variants (`timer`, `metric`, `metricSmall`) for values that change digit by digit.
- Dynamic values that depend on state may be passed inline in a style array; everything static belongs in `createStyles`.

```tsx
// WRONG: raw values, object rebuilt every render
<View style={{ padding: 16, backgroundColor: '#fff' }} />;

// CORRECT
const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      padding: theme.spacing.md,
      backgroundColor: theme.colors.surface,
    },
  });

const styles = useThemedStyles(createStyles);
<View style={styles.card} />;
```

## Platform

- Android only: do not add iOS-specific files or branches. Use `Platform.select` only where an existing token already does (e.g. `fontFamilies.mono`).
- Account for safe areas through the `Screen` shell and `react-native-safe-area-context`; never hardcode status-bar or navigation-bar offsets.

## Imports & Project Layout

- Use the path aliases, importing the concrete file: `@components/Card`, `@hooks/useTheme`, `@utils/format`, `@services/sessionStorage`, `@constants/previewData`. Reach theme, types and the screens barrel through `@/` (`@/theme/theme`, `@/types/navigation`, `@/screens`).
- Import order is lint-enforced: `react`, then `react-native`, then other packages, then aliases, then relative — a blank line between groups, alphabetised within each.
- Keep files focused (200-400 lines typical, 800 max).

## Logging

- No `console.log` in committed code.
- Surface user-facing errors through UI state, not the console.

## TypeScript

All rules in `rules/typescript/` apply. This file only adds React Native specific guidance on top.

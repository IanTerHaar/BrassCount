---
paths:
  - 'src/theme/**/*.ts'
  - 'src/hooks/useTheme.ts'
---

# Theme Rules

- `theme.ts` exports `lightTheme`/`darkTheme`; both must satisfy the exact same `SemanticColors` shape. Adding, renaming, or removing a semantic color key requires updating both objects in the same change.
- Never reference `palette` entries outside `theme.ts`. Anything a component or screen needs must be exposed as a semantic token (`colors.textPrimary`, not `palette.grey900`).
- `spacing`/`radius`/`typography` are the only proportional scales — don't introduce a new one-off numeric literal for spacing/sizing in a component when an existing token fits.
- `useTheme()` is the only sanctioned way to read the active theme in a component/hook; don't import `lightTheme`/`darkTheme` directly or re-derive the color scheme with `useColorScheme()` elsewhere.
- Numeric/timer/metric text must use the `timer`/`metric`/`metricSmall` typography variants (monospace `fontFamily`) so digits don't shift width as they change.

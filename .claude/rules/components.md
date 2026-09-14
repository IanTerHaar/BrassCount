---
paths:
  - 'src/components/**/*.tsx'
  - 'src/screens/**/*.tsx'
---

# Component & Screen Rules

- Never render raw React Native `<Text>` — always use `Typography` with a semantic `variant`/`color` (use the `timer`/`metric`/`metricSmall` variants for numeric/counting display so digits don't jitter horizontally).
- If a component takes an optional `onPress`, render it as `TouchableOpacity`/`Pressable` with `accessibilityRole="button"` (and `accessibilityState` where relevant) when `onPress` is set, and a plain `View` otherwise — don't add a separate `interactive`/`pressable` boolean prop for this.
- Expose a passthrough `testID?: string` prop and apply it to the root element.
- Style with `useThemedStyles(createStyles)`, where `createStyles(theme: Theme)` is defined at module scope, not a factory recreated per render. Never reference the raw `palette` or call `useColorScheme()` directly — go through `useTheme()`.

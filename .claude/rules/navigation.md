---
paths:
  - 'src/navigation/**/*.tsx'
  - 'src/types/navigation.ts'
---

# Navigation Rules

- Screen param types live only in `src/types/navigation.ts` (`RootStackParamList`, `MainTabParamList`, `HistoryStackParamList`). Extend one of those; never declare a screen's params inline in the screen or navigator file.
- Keep `History` as a nested stack (`HistoryStack`) rather than moving `HistoryDetail` onto the root stack — a root-stack screen would cover the bottom tab bar.
- A new bottom-tab screen is added to `MainTabParamList` and wired into `MainTabs`; a new modal/full-screen flow is added to `RootStackParamList` and wired into `RootNavigator`, not into `MainTabs`.
- If `RootNavigator`'s theme mapping (`toNavigationTheme`) changes, keep it driven by the app's semantic theme tokens in `src/theme/theme.ts` — don't hardcode header/card colors that bypass them.

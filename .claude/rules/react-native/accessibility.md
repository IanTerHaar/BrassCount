---
paths:
  - '**/*.ts'
  - '**/*.tsx'
---

# React Native Accessibility

> Treat accessibility as a release requirement, not an afterthought.
> Target: usable with TalkBack on Android and at large system font sizes. The app is used at a shooting range — often outdoors, at arm's length, with gloves — so large targets and strong contrast matter for every user.

## Labeling

- Every interactive element has an `accessibilityRole` and an `accessibilityLabel` (or readable child text).
- Icon-only controls MUST have an `accessibilityLabel` — there is no visible text for the reader to announce.
- Labels describe the action in its current state: the timer button reads "Start timer", "Cancel start" or "Stop timer", not a fixed "Timer button".
- Use `accessibilityHint` only when the action is non-obvious; keep it short.
- Group related elements with `accessible` on the container so they are announced as one unit when appropriate.

```tsx
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel="Edit drill"
  onPress={onEdit}
>
  <Icon name="pencil" color="primary" />
</TouchableOpacity>
```

## State & Live Regions

- Communicate state with `accessibilityState` (`{ disabled, selected, checked, expanded }`) — see the tab bar and `Chip`.
- Announce transient changes (validation errors, "audio unavailable") via `accessibilityLiveRegion` or `AccessibilityInfo.announceForAccessibility`.
- Reflect loading, error and empty states in text the reader can reach — not just a spinner or a color.

## Touch Targets & Layout

- Minimum touch target 48x48dp; use `hitSlop` to enlarge small controls.
- Respect system font scaling — avoid fixed heights that clip scaled text, and test at the largest font size.
- Gate non-essential animation on `AccessibilityInfo.isReduceMotionEnabled`.

## Color & Contrast

- Do not convey meaning by color alone; pair with text, icon or shape (an over-par time turns `danger` **and** the caption changes to "OVER PAR").
- Meet WCAG AA contrast: 4.5:1 for body text, 3:1 for large text and meaningful UI elements.
- Verify both the light and the dark theme whenever a semantic color changes in `src/theme/theme.ts`.

## Focus & Navigation

- Keep a logical focus order; move focus to new content (modals, pushed screens) on open and restore it on close.
- Custom components must be reachable and operable by the screen reader, not just by touch.

## Testing

- Walk changed flows with TalkBack on a real device — automated checks do not catch everything.
- In component tests, assert the `accessibilityLabel` / `accessibilityState` of controls whose meaning changes with state.

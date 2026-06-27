# BrassCount

React Native + TypeScript application boilerplate. **Android-first**, no Expo.
Built with the `@react-native-community/cli` template plus a curated set of
extras so you can start shipping features immediately.

## What's in the box

- **React Native 0.86** + **TypeScript** (strict-ish — extends `@react-native/typescript-config`)
- **React Navigation v7** — native stack + bottom tabs, fully typed
- **Zustand** — lightweight state management (`src/store/counterStore.ts` as an example)
- **react-native-dotenv** — typed `.env` access via `import { ... } from '@env'`
- **Path aliases** — `@/...`, `@components/...`, `@screens/...`, `@navigation/...`, `@store/...`, `@hooks/...`, `@utils/...`, `@theme/...`, `@types/...`, `@api/...`, `@assets/...`
- **ESLint** (`@react-native` + `import` plugin) + **Prettier** + **TypeScript**
- **Jest** with `@react-native/jest-preset` and path-alias mapping
- **Husky** + **lint-staged** pre-commit hook (auto-fix lint + format on `git commit`)
- **GitHub Actions**:
  - `build.yml` — Android `assembleDebug` on push/PR, uploads APK
  - `lint.yml` — ESLint + Prettier + `tsc --noEmit`
  - `pr-check.yml` — full validation gate for PRs (lint, format, typecheck, tests, semantic title)
  - `security-audit.yml` — `npm audit` weekly (Mon 06:00 UTC = 08:00 SAST)
  - `stale.yml` — auto-mark/close stale issues & PRs weekly (Mon 06:00 UTC)
  - `tests.yml` — Jest with coverage
- **PR template** at `.github/pull_request_template.md`

## Prerequisites

- **Node.js 22+** (`engines.node` enforces `>= 22.11.0`)
- **JDK 17** (Temurin recommended) — required for Android Gradle
- **Android Studio** with an emulator or a USB-debugging-enabled device
- **Watchman** (recommended on macOS/Linux)

Follow [Set up your environment](https://reactnative.dev/docs/set-up-your-environment)
in the React Native docs for full per-OS instructions.

## Quick start

```sh
# 1. Install dependencies
npm install

# 2. Create your local env file (only .env.example is committed)
cp .env.example .env

# 3. Start the Metro bundler in one terminal
npm start

# 4. In a second terminal, build & launch on Android
npm run android
```

## Scripts

| Script                    | What it does                                              |
| ------------------------- | --------------------------------------------------------- |
| `npm start`               | Start Metro bundler                                       |
| `npm run android`         | Build & run on Android (emulator or device)               |
| `npm run android:release` | Gradle `assembleRelease` (uses debug keystore by default) |
| `npm run android:bundle`  | Gradle `bundleRelease` (AAB)                              |
| `npm run android:clean`   | Gradle `clean`                                            |
| `npm run typecheck`       | `tsc --noEmit`                                            |
| `npm run lint`            | ESLint (`--max-warnings=0`)                               |
| `npm run lint:fix`        | ESLint with `--fix`                                       |
| `npm run format`          | Prettier write                                            |
| `npm run format:check`    | Prettier check (CI)                                       |
| `npm test`                | Jest                                                      |
| `npm run test:ci`         | Jest with coverage (used in CI)                           |

## Project layout

```
.
├── android/                  # Native Android project (applicationId: com.brasscount.app)
├── __tests__/                # Jest tests
├── __mocks__/                # Jest manual mocks (e.g. @env)
├── src/
│   ├── api/                  # HTTP client + API modules
│   ├── assets/               # Static assets (images, fonts)
│   ├── components/           # Reusable UI components
│   ├── hooks/                # Custom React hooks (e.g. useTheme)
│   ├── navigation/           # React Navigation stacks/tabs
│   ├── screens/              # Screen components
│   ├── store/                # Zustand stores
│   ├── theme/                # Colours, spacing, radii tokens
│   ├── types/                # Shared TypeScript types + env.d.ts
│   └── utils/                # Pure helper functions
├── .github/
│   ├── workflows/            # CI workflows
│   └── pull_request_template.md
├── App.tsx                   # Root component (providers + RootNavigator)
├── index.js                  # AppRegistry entry
├── babel.config.js           # Babel + module-resolver + dotenv
├── jest.config.js            # Jest preset + path aliases + transformIgnorePatterns
├── jest.setup.js             # gesture-handler jest setup
├── tsconfig.json             # extends @react-native/typescript-config + path aliases
├── .eslintrc.js              # @react-native + import plugin
├── .prettierrc.js
├── .env.example              # commit this — `.env` is gitignored
└── package.json
```

## Path aliases

Import from anywhere with short, stable paths. The aliases are mirrored in
**three** places — keep them in sync if you add more:

1. `babel.config.js` → `babel-plugin-module-resolver` (runtime resolution)
2. `tsconfig.json` → `compilerOptions.paths` (TypeScript)
3. `jest.config.js` → `moduleNameMapper` (Jest)

```ts
import { Button } from '@components/Button';
import { useCounterStore } from '@store/counterStore';
import { API_BASE_URL } from '@env';
```

## Environment variables

Put values in `.env`. Only `.env.example` is committed. Variables are exposed
to TypeScript via `src/types/env.d.ts` — **add any new variable in both
`.env.example` and `env.d.ts`** to keep types accurate.

```ts
import { API_BASE_URL } from '@env';
```

In Jest, `@env` is replaced by `__mocks__/@env.js` (test-safe constants).

## State management (Zustand)

```ts
// src/store/counterStore.ts
export const useCounterStore = create<CounterState>(set => ({
  count: 0,
  increment: () => set(state => ({ count: state.count + 1 })),
  decrement: () => set(state => ({ count: state.count - 1 })),
  reset: () => set({ count: 0 }),
}));
```

Use selectors in components to avoid unnecessary re-renders:

```ts
const count = useCounterStore(state => state.count);
const increment = useCounterStore(state => state.increment);
```

## Navigation

Typed via `RootStackParamList` in `src/types/navigation.ts`. The root stack
wraps a bottom-tabs navigator. Navigate with `navigation.navigate('Details', { id })`
and read params with `useRoute<RouteProp<RootStackParamList, 'Details'>>()`.

## Linting & formatting

- ESLint extends `@react-native` plus `plugin:import/recommended` for ordered
  imports. `npm run lint` fails on any warning.
- Prettier config lives in `.prettierrc.js` (single quotes, trailing commas).
- The pre-commit hook (Husky + lint-staged) runs `eslint --fix` and
  `prettier --write` on staged files only — fast and non-blocking for the
  rest of the repo.

## Testing

```sh
npm test                  # watch-friendly local run
npm run test:ci           # CI mode with coverage
npm test -- counterStore  # run a single test file
npm test -- -t "increments"  # run by test name
```

Tests live in `__tests__/` and any `*.test.ts(x)` files under `src/`. Jest is
configured to honour all the path aliases.

## Android release builds

The Android project ships with a **debug keystore** wired into the `release`
build type so you can produce a release APK locally without any extra setup:

```sh
npm run android:release   # APK -> android/app/build/outputs/apk/release/
npm run android:bundle    # AAB -> android/app/build/outputs/bundle/release/
```

Before shipping to the Play Store, replace the keystore by following
[Generating a signed APK](https://reactnative.dev/docs/signed-apk-android) and
moving the credentials into Gradle properties / secrets — **do not commit
your production keystore**.

## CI workflows

| Workflow             | Trigger                           | Notes                                       |
| -------------------- | --------------------------------- | ------------------------------------------- |
| `build.yml`          | push & PR to `main`, manual       | `gradlew assembleDebug`, uploads APK        |
| `lint.yml`           | push & PR to `main`, manual       | ESLint, Prettier, `tsc --noEmit`            |
| `pr-check.yml`       | PR to `main` (non-draft), manual  | Full validation + semantic PR title check   |
| `tests.yml`          | push & PR to `main`, manual       | Jest with coverage upload                   |
| `security-audit.yml` | cron `0 6 * * 1` (Mon 08:00 SAST) | `npm audit --audit-level=high`, JSON report |
| `stale.yml`          | cron `0 6 * * 1` (Mon 08:00 SAST) | 30d → stale → 14d → close (issues)          |

> GitHub Actions cron is in **UTC**. `0 6 * * 1` = 06:00 UTC = 08:00 SAST
> (UTC+2). Change the cron in those two workflows if your timezone differs.

## License

Add a `LICENSE` file when you're ready to choose one.

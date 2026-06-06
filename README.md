# BrassCount

A shot timing and performance tracking mobile application for shooting sports enthusiasts. Built with React Native and Expo runs on Android.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | React Native 0.81.5 + Expo 54 |
| Language | TypeScript 5.3 (strict mode) |
| Navigation | React Navigation 6 (bottom tabs) |
| Icons | @expo/vector-icons (Ionicons) |
| Backend | Firebase 10 |
| Platform | Android |

## Getting Started

**Prerequisites:** Node.js 20+, Expo CLI

```bash
# Install dependencies
npm install

# Start development server (choose platform interactively)
npm start

# Start for a specific platform
npm run android     # Android emulator
```

> `npm start` uses `--tunnel` mode for remote device access via Expo Go.

## CI/CD

All pipelines run on GitHub Actions:

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `build.yml` | Push to `main` | Bumps version, builds Android APK, creates GitHub Release |
| `check.yml` | Push / PR | TypeScript type-check + ESLint (zero warnings) |
| `test.yml` | Push / PR | Jest with coverage report |
| `pr-check.yml` | PRs to `main` | Bundle size check, posts comment on PR |
| `security.yml` | Push / Mondays | `npm audit` + dependency review |
| `stale.yml` | Mondays | Marks stale issues (30 days) and PRs (14 days) |

Release APKs are attached to GitHub Releases automatically on every merge to `main`.

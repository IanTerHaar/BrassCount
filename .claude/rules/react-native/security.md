---
paths:
  - '**/*.ts'
  - '**/*.tsx'
---

# React Native Security

> This file extends [common/security.md](../common/security.md) with React Native specific content.

## The Bundle Is Public

Treat everything shipped in the app as readable by an attacker: an APK can be unpacked and the JS bundle read.

- Never ship real secrets (private API keys, signing secrets) in the JS bundle, `app.json` or `.env`.
- Values imported from `@env` are inlined at build time and are public.
- If a backend is added later, enforce authorization on the server; never trust the client.

## Storage

- AsyncStorage is plain, unencrypted storage. Use it for drills, sessions and preferences only.
- If the app ever needs to hold a credential or token, it requires Android Keystore-backed storage — that is a new native dependency to agree with the user first.
- All reads and writes go through `src/services/storage.ts`.

## Untrusted Input

- Treat data read back from storage as untrusted: it may be corrupt, or written by an older version of the app. Guard before use; never assume the shape.
- Validate and clamp user-entered numbers (par times, counts) before storing or computing with them.
- No deep links are registered. If linking is added, validate every param before routing or loading data.

## Permissions & Privacy

- Request the minimum Android permissions, at the moment they are needed, with a clear reason in the UI. The manifest currently declares only `INTERNET`.
- Microphone access (for shot detection / calibration) needs `RECORD_AUDIO` in the manifest **and** a runtime request; handle denial with an actionable message rather than a dead screen.
- Process audio on-device; do not store or transmit recordings without the user explicitly choosing to.
- Declare data collection accurately in the Play Store listing.

## Network

- The app makes no network calls today. If that changes: HTTPS only, and validate every response before use.
- Cleartext traffic is controlled by the `usesCleartextTraffic` manifest placeholder; it must stay `false` for release builds.

## Dependencies

- Run `npm audit` when adding or upgrading packages; the weekly `security-audit` workflow also reports.
- Review what a new native module adds to the merged manifest (permissions, services, receivers).

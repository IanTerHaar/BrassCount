---
paths:
  - '**/*.kt'
  - '**/*.kts'
  - '**/*.gradle'
  - '**/AndroidManifest.xml'
---

# Kotlin / Android Security

> This file extends [common/security.md](../common/security.md) with Android-specific content.

## Manifest

- `MainActivity` is the only exported component, and only because it is the launcher. Any new activity, service, receiver or provider defaults to `android:exported="false"`.
- `android:allowBackup` is `false`; keep it unless the user decides app data should be backed up.
- `android:usesCleartextTraffic` is a manifest placeholder that React Native sets to `true` for debug (Metro) and `false` for release. Do not hardcode it to `true`.
- Do not add intent filters or deep-link schemes without validating every incoming value on the JS side.

## Permissions

- Declare the minimum. The manifest currently has only `INTERNET`.
- Dangerous permissions (`RECORD_AUDIO` for shot detection) need both the manifest entry and a runtime request, made when the feature is first used.
- Check the permission immediately before using the protected API every time — the user can revoke it between sessions — and reject the JS promise with a clear code when it is missing.
- Review the merged manifest after adding a native dependency to see what permissions and components it brought in.

## Secrets and Signing

- Never hardcode API keys, tokens or passwords in Kotlin, Gradle files or `strings.xml`.
- `debug.keystore` and its well-known passwords in `android/app/build.gradle` are public by design and only for debug builds.
- Release signing credentials come from git-ignored Gradle properties or CI secrets. `*.keystore` is git-ignored apart from the debug keystore — never force-add one.
- `local.properties` stays untracked.

## Data Protection

- Do not write user data to external or world-readable storage.
- Captured audio is processed in memory; do not persist raw recordings unless the user explicitly asked for that feature.
- Never log audio data, file paths under the app's private directory, or anything user-identifying.

## Input from JavaScript

Treat every argument crossing the bridge as untrusted: check types, ranges and presence before use, and reject rather than crash on bad input.

## R8 / ProGuard

- Release builds use `android/app/proguard-rules.pro`. Add keep rules for anything accessed by reflection, and test the release build after adding them.
- Do not disable minification to work around a crash — find the missing keep rule.

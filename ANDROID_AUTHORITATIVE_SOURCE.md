# Queless Android Authoritative Source

The active Queless application in this repository is the only current app source.

## Authoritative Source

- Repository: `C:\Users\User\OneDrive\Documents\Codex\2026-04-19-files-mentioned-by-the-user-barber\queless-rc-security`
- Branch: `rc/backend-security-foundation`
- Frontend source: `frontend`
- Approved Android source path: `android`
- Approved build script: `scripts/buildAndroidLocalQa.cjs`
- Approved local-QA build command: `npm run android:local-qa:build`
- Backward-compatible local-QA build alias: `npm run android:local-qa`
- Approved local-QA install command: `npm run android:local-qa:install`
- Local-QA package: `org.queless.app.localqa`
- Production package: `org.queless.app`

The old Queless Android app previously used by Codex has been deleted by the user. It must not be restored, copied, rebuilt, or treated as a fallback source.

The authoritative app frontend is present in this repository, and the authoritative native Capacitor wrapper lives at `android`. It was restored only from this repository's own Android-wrapper history and relocated into the current repository root; generated web assets were not restored as source.

## Never Use As Source

Do not build Android from:

- `..\barber-booking-app\frontend`
- `C:\Users\User\AppData\Local\Temp\queless-android-shell-clean-20260728-153345`
- Any `C:\Users\User\AppData\Local\Temp\queless-*` Android shell
- Any `.codex-*` preservation folder
- Any backup, archive, APK extraction, Recycle Bin, OneDrive history, or generated Gradle output
- Any `dist`, `www`, `app/src/main/assets/public`, or APK that was not produced by the approved build script from this repository

Temporary Android shells are not authoritative, even when they build successfully.

## Build Verification Contract

The Android local-QA build must fail unless:

- Git repository is this repository.
- Branch is `rc/backend-security-foundation`.
- Android source path is exactly `android` inside this repository.
- Capacitor config uses `org.queless.app`, `Queless`, and `dist`.
- Debug builds use the `.localqa` application ID suffix.
- Frontend commit can be identified.
- Frontend build produces `version.json`.
- Packaged `version.json` matches the frontend commit.
- Packaged assets hash-match the fresh frontend `dist`.
- Current routes are present: `/login`, `/home`, `/smart-match`, `/provider/ai-coach`, `/provider/platinum`.
- `queless-build-manifest.json` is packaged.
- Old source paths, preservation snapshots, and temp shells are not referenced.
- Product, shop, cart, and physical marketplace route literals are absent from packaged production assets.

## Build Manifest

Local-QA builds must package `queless-build-manifest.json` with:

- Repository path
- Repository identifier
- Branch
- Git commit
- Build timestamp
- Build type
- Package name
- App name
- App version
- Version code
- Frontend output hash
- Android source path
- Android source hash
- Main JavaScript bundle hash
- Main CSS bundle hash
- Required route checks
- Old-flow absence checks
- Packaged route list

## Current UI Checks

Before installing a local-QA APK, inspect the packaged assets and confirm:

- Email-based login is present.
- Smart Match is present.
- Provider Coach is present.
- Provider Platinum operations are present.
- Current Queless branding is present.
- Old phone OTP login screens are absent.
- Old barber-only dashboards are absent.
- Product, shop, cart, and physical marketplace flows are absent.

Do not install `org.queless.app.localqa` until these checks pass and the user explicitly approves installing a second Queless app.

Never uninstall, update, or clear data for `org.queless.app` during local QA.

## Local QA Installation Guard

`npm run android:local-qa` and `npm run android:local-qa:build` build only. They must not install an APK.

Installing Local QA is intentionally separate because it creates a second visible Android application:

- Real user-facing app: `org.queless.app`
- Testing copy: `org.queless.app.localqa`

Before installing Local QA, Codex or any developer must ask the user for explicit approval and then run:

```powershell
$env:QUELESS_CONFIRM_LOCALQA_INSTALL="I_UNDERSTAND_THIS_INSTALLS_SEPARATE_LOCAL_QA"
npm run android:local-qa:install
```

Visual user-facing verification should use `org.queless.app` unless the user specifically approves Local QA testing. The Local QA package must not be treated as proof of the visible current Queless app on the user's phone.

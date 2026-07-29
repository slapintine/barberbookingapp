# Queless Android Authoritative Source

The active Queless application in this repository is the only current app source.

## Authoritative Source

- Repository: `C:\Users\User\OneDrive\Documents\Codex\2026-04-19-files-mentioned-by-the-user-barber\queless-rc-security`
- Branch: `rc/backend-security-foundation`
- Frontend source: `frontend`
- Approved Android source path: `android`
- Approved build script: `scripts/buildAndroidLocalQa.cjs`
- Approved local-QA build command: `npm run android:local-qa`
- Local-QA package: `org.queless.app.localqa`
- Production package: `org.queless.app`

The old Queless Android app previously used by Codex has been deleted by the user. It must not be restored, copied, rebuilt, or treated as a fallback source.

At the time this guardrail was added, the authoritative app frontend is present in this repository, but the authoritative in-repository Android shell still has to be created or proven at `android` before any APK build may resume. A failing local-QA Android build is safer than silently packaging stale assets from another worktree.

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
- Frontend commit can be identified.
- Frontend build produces `version.json`.
- Packaged `version.json` matches the frontend commit.
- Packaged assets hash-match the fresh frontend `dist`.
- Current routes are present: `/login`, `/home`, `/smart-match`, `/provider/ai-coach`, `/provider/platinum`.
- `queless-build-manifest.json` is packaged.
- Old source paths, preservation snapshots, and temp shells are not referenced.

## Build Manifest

Local-QA builds must package `queless-build-manifest.json` with:

- Repository path
- Branch
- Git commit
- Build timestamp
- Build type
- Package name
- App version
- Version code
- Frontend output hash
- Android source path
- Android source hash
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

Do not install `org.queless.app.localqa` until these checks pass.

Never uninstall, update, or clear data for `org.queless.app` during local QA.

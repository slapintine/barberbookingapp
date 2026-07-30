# Queless Real vs Local QA Parity Matrix

Audit date: 2026-07-30

Authoritative repository: `queless-rc-security`

Branch: `rc/backend-security-foundation`

Benchmark package: `org.queless.app`

Local QA package: `org.queless.app.localqa`

Evidence folder: `.codex-real-vs-localqa-parity-20260730-121038`

## Package Baseline

| Package | Version | Version code | Install/update state | Role in audit |
| --- | --- | --- | --- | --- |
| `org.queless.app` | `1.0.7` | `8` | Preserved; not updated, cleared, or uninstalled | Visual and behavioural benchmark only |
| `org.queless.app.localqa` | `1.0.7-localqa` | `8` | Separate QA package | Source-backed QA target |

## Matrix

| Screen | Real app | Local QA | Difference | Root cause | Required fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Customer home shell | `.codex-real-vs-localqa-parity-20260730-121038/real-home.png`; `.codex-real-vs-localqa-parity-20260730-121038/after-real-home.png` | `.codex-real-vs-localqa-parity-20260730-121038/localqa-home.png`; `.codex-real-vs-localqa-parity-20260730-121038/after-localqa-wait.png` | Local QA status/navigation icons used light icon mode; real app uses dark icon mode on the same maroon bars. | Native Android system-bar configuration in `MainActivity.java` and `styles.xml`. | Match real-app icon mode while preserving package separation. | Fixed and physically verified after Local QA reinstall. |
| Customer home hero | `.codex-real-vs-localqa-parity-20260730-121038/real-home.png`; `.codex-real-vs-localqa-parity-20260730-121038/after-real-home.png` | `.codex-real-vs-localqa-parity-20260730-121038/localqa-home.png`; `.codex-real-vs-localqa-parity-20260730-121038/after-localqa-wait.png` | Local QA showed an extra `Trusted local services` eyebrow not visible in the real app. | Current source rendered a newer eyebrow element that did not match the installed benchmark. | Hide/remove the eyebrow from the visible home hero. | Fixed and physically verified after Local QA reinstall. |
| Customer home CTA | `.codex-real-vs-localqa-parity-20260730-121038/real-home.png`; `.codex-real-vs-localqa-parity-20260730-121038/after-real-home.png` | `.codex-real-vs-localqa-parity-20260730-121038/localqa-home.png`; `.codex-real-vs-localqa-parity-20260730-121038/after-localqa-wait.png` | Real app reads `Find services`; Local QA read `Find Services`. | Source text mismatch. | Use benchmark casing. | Fixed and physically verified after Local QA reinstall. |
| Customer home smart shortcut | `.codex-real-vs-localqa-parity-20260730-121038/real-home.png`; `.codex-real-vs-localqa-parity-20260730-121038/after-real-home.png` | `.codex-real-vs-localqa-parity-20260730-121038/localqa-home.png`; `.codex-real-vs-localqa-parity-20260730-121038/after-localqa-wait.png` | Local QA lightning action was pinker/brighter than the real app. | Source CSS used a Local QA/current-source gradient variant. | Use the same purple primary gradient as the real app benchmark. | Fixed and physically verified after Local QA reinstall. |
| Customer provider section | `.codex-real-vs-localqa-parity-20260730-121038/real-home.png`; `.codex-real-vs-localqa-parity-20260730-121038/after-real-home.png` | `.codex-real-vs-localqa-parity-20260730-121038/localqa-home.png`; `.codex-real-vs-localqa-parity-20260730-121038/after-localqa-wait.png` | Real app title reads `Featured service providers`; Local QA read `Top Providers`. | Source copy mismatch. | Use benchmark title and matching aria label. | Fixed and physically verified after Local QA reinstall. |
| Customer home location/account | `.codex-real-vs-localqa-parity-20260730-121038/real-home.png` | `.codex-real-vs-localqa-parity-20260730-121038/localqa-home.png` | Real app shows `Nakwero A, Wakiso` and initials `US`; Local QA shows `Near you` and initials `QQ`. | Account/data state difference between production app data and Local QA fixtures/storage. | Do not force production data into QA; use equivalent QA state for future comparisons where possible. | Documented intentional/account difference. |
| Categories | `.codex-real-vs-localqa-parity-20260730-121038/real-categories.png` | `.codex-real-vs-localqa-parity-20260730-121038/localqa-categories.png`; `.codex-real-vs-localqa-parity-20260730-121038/after-localqa-categories.png` | Layout, cards, typography, and nav are structurally close; status icon mode and account/location state differ. | Shared native shell plus account/data state. | Covered by system-bar fix; account state remains separate. | Shared shell fixed and physically rechecked. |
| Bookings | `.codex-real-vs-localqa-parity-20260730-121038/real-bookings.png` | `.codex-real-vs-localqa-parity-20260730-121038/localqa-bookings.png` | Captured data differs because app packages hold different signed-in accounts and booking fixtures. | Account/data state difference. | Recompare with matched local fixture account during signed-in QA. | Cannot compare safely yet. |
| Inbox | `.codex-real-vs-localqa-parity-20260730-121038/real-inbox.png` | `.codex-real-vs-localqa-parity-20260730-121038/localqa-inbox.png` | Basic shell is close; content differs by account/data. | Account/data state difference. | Recompare with matched test state if needed. | No source defect confirmed. |
| Profile | `.codex-real-vs-localqa-parity-20260730-121038/real-profile.png` | `.codex-real-vs-localqa-parity-20260730-121038/localqa-profile.png` | Profile identity and plan data differ; shared visual shell looks close aside from native status mode. | Account/data state difference plus native shell. | Native fix applied; do not copy real account data. | Partially fixed; rebuilt verification pending. |

## Current Findings

- The user-visible concern was valid: Local QA did not visually match the real app on the customer home screen.
- Confirmed source/native defects were limited to shared shell/home presentation in this pass.
- Account-specific differences must not be treated as defects unless equivalent role, plan, and fixture state are established.
- No product, shop, cart, marketplace, old phone OTP, or barber-only screen was observed in the captured customer tab pair.

## Pending Verification

- Continue broader customer/provider parity only after the shared app-shell mismatch is resolved.
- Full provider-screen parity was not completed in this focused pass.
- The first Local QA launch after reinstall briefly showed the loading screen before recovering to Home; monitor this during the next signed-in QA pass.

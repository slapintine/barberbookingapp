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
| Category provider result | `.codex-real-vs-localqa-parity-20260730-121038/real-provider-results-barber.png` | `.codex-real-vs-localqa-parity-20260730-121038/localqa-provider-results-barber.png` | Shell, header, empty-state card, buttons, and bottom nav match. Smart Match CTA copy differs. | Account/entitlement difference: real app account shows active Smart Match category copy; Local QA fixture shows Premium-gated copy. | Use matched plan state for future entitlement-specific comparisons; no styling fix required. | Physically compared; no source defect confirmed. |
| Provider profile / booking drill-in attempt | `.codex-real-vs-localqa-parity-20260730-121038/real-provider-profile-or-details.png` | `.codex-real-vs-localqa-parity-20260730-121038/localqa-provider-profile-or-details.png` | Tap landed on the category empty state in both apps, not a provider profile. Visual parity holds for the reached state. | No provider existed in the selected category for either captured account/state. | Capture provider profile with seeded matching providers during signed-in QA. | Cannot compare provider profile safely from this tap path. |
| Booking modal attempt | `.codex-real-vs-localqa-parity-20260730-121038/real-booking-modal-attempt.png` | `.codex-real-vs-localqa-parity-20260730-121038/localqa-booking-modal-attempt.png` | Tap remained on the category empty state in both apps; booking modal was not opened. | No provider/service reached from this path. | Capture booking modal via known seeded provider/service route. | Pending targeted booking-modal pair. |
| Bookings | `.codex-real-vs-localqa-parity-20260730-121038/fresh2-real-bookings.png` | `.codex-real-vs-localqa-parity-20260730-121038/fresh2-localqa-bookings.png`; `.codex-real-vs-localqa-parity-20260730-121038/after-correct-apk-localqa-bookings.png` | Local QA initially rendered raw browser-default booking tabs instead of the rounded Queless tab shell; content also differs by fixture account. After fix, Local QA booking tabs render the rounded Queless shell with active purple pill and count badges. | `frontend/src/styles/bookings-tabs.css` defined the current styling but was not imported by the app stylesheet bundle. | Import the shared bookings tab stylesheet and guard it with a parity regression test. | Fixed and physically verified on Samsung A05 after Local QA reinstall. |
| Inbox | `.codex-real-vs-localqa-parity-20260730-121038/fresh2-real-inbox.png` | `.codex-real-vs-localqa-parity-20260730-121038/fresh2-localqa-inbox.png` | Shared shell and empty/error card styling are aligned. Real app shows a sign-in/auth empty state; Local QA shows a retryable local-backend error state. | Backend/session/data-state difference: local backend was not running during the Local QA inbox capture. | Recompare with backend online and matched auth state during signed-in QA; no styling source defect confirmed. | Physically compared; data-state difference documented. |
| Profile | `.codex-real-vs-localqa-parity-20260730-121038/fresh2-real-profile.png` | `.codex-real-vs-localqa-parity-20260730-121038/fresh2-localqa-profile.png` | Profile identity, plan chips, and notification controls differ; shared visual shell, cards, tabs, typography, and bottom nav are close. | Account/data and notification-permission state differences between production app data and Local QA fixtures. | Do not copy real account data into QA; compare with matched fixtures where practical. | Physically compared; no shared styling defect confirmed. |

## Current Findings

- The user-visible concern was valid: Local QA did not visually match the real app on the customer home screen.
- Confirmed source/native defects so far were shared shell/home presentation and the missing Bookings tab stylesheet import.
- Account-specific differences must not be treated as defects unless equivalent role, plan, and fixture state are established.
- No product, shop, cart, marketplace, old phone OTP, or barber-only screen was observed in the captured customer tab pair.

## Pending Verification

- Continue broader customer/provider parity after the Bookings tab styling fix; provider profile and booking modal still need targeted seeded routes.
- Full provider-screen parity was not completed in this focused pass.
- The first Local QA launch after reinstall briefly showed the loading screen before recovering to Home; monitor this during the next signed-in QA pass.

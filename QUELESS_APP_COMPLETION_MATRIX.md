# Queless App Completion Matrix

Authoritative source: `queless-rc-security/frontend` and `queless-rc-security/android`.

Real app benchmark package: `org.queless.app`.
Local QA package: `org.queless.app.localqa`.

This matrix tracks whether the current Local QA app is a working twin of the current real Queless experience plus the newer premium features in this repository. Do not mark a feature complete unless UI, backend authorization, persistence, loading/error/empty states, Android behaviour, responsive layout, automated tests, and physical Local QA verification all pass.

## Status Key

- Complete: verified end to end on Local QA and covered by relevant tests.
- Visually incomplete: visible UI differs or breaks layout.
- Logic incomplete: UI exists but actions, backend, authorization, or persistence are incomplete.
- Foundation only: backend/data structure exists but no complete user journey is verified.
- Placeholder: static/draft-only/no-op behaviour remains.
- Broken: route/action fails or blocks a core journey.
- Missing: required screen or user action is absent.
- Not applicable: not part of the current Queless product.
- Intentionally Local-QA-only: diagnostic/package-only differences.

## Priority 0 - Core Journeys

| Area | Route / Screen | User | Backend dependency | Real-app benchmark | Local QA status | Gap / evidence | Completion criteria |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Authentication | `/login`, `/signup`, `/forgot-password` / `AuthScreen` | Customer, Provider | `/api/auth/*` | Email/password login, no phone OTP | Partially verified | Login screen visually current; full registration/reset/keyboard paths still need signed-in Local QA verification. | Login, register, reset, invalid credentials, loading/error states and keyboard-first Back pass on Samsung A05. |
| Customer home | `/home` / `HomePage` | Customer | `/api/barbers`, `/api/profiles`, `/api/subscriptions/summary` | Current polished home with service discovery hero | Complete for visual baseline | Real and Local QA screenshots captured; bottom nav safe-area fixed. | Home loads with current branding, no old screens, no horizontal overflow, useful empty states. |
| Categories/search | `/categories`, `/services` | Customer | `/api/barbers`, service catalog | Current category cards/search entry | Partially verified | Route inventory exists; physical category and search result action path still not complete. | Category selection, search, filters, empty recovery and provider cards verified. |
| Provider profile | Provider sheet / profile overlay | Customer | `/api/barbers`, `/api/reviews`, `/api/favorites` | Real app provider cards/profile | Not yet physically verified in this pass | Needs service selection, favourite, contact and booking handoff proof. | Opens real provider, services/prices/durations/reviews/portfolio/location show correctly. |
| Booking creation | Booking modal / `/booking-confirmed` | Customer | `/api/bookings`, availability hooks | Current booking UI | Not yet verified in this pass | Must complete provider/service/date/time/notes/confirm flow against local data. | Booking persists, prevents duplicate submit, survives refresh, handles invalid slots. |
| Bookings/live status | `/bookings` / `BookingsPage` | Customer, Provider | `/api/bookings/*` | Existing booking management | Partially verified historically | Needs rerun after current Local QA fixes. | Booking detail, live status, queue estimate, cancellation/reschedule states verified. |
| Provider dashboard | `/dashboard` / `DashboardPage` | Provider | `/api/barbers/me`, `/api/bookings`, `/api/provider-premium/*` | Current provider shell | Not yet verified in this pass | Provider signed-in journeys still pending. | Dashboard, services, schedule, bookings, profile edits persist and protect existing data. |
| App shell | Header, bottom nav, status/safe areas | All | Native shell + CSS | Real app dark status strip and floating nav | Complete for confirmed defects | Fixed notification-card raw UI and bottom-nav overlap on A05. | No action bar, no status overlap, no nav overlap, no blank deep route. |

## Priority 1 - Product Value

| Area | Route / Screen | User | Backend dependency | Local QA status | Gap / evidence | Completion criteria |
| --- | --- | --- | --- | --- | --- | --- |
| Smart Match | `/smart-match` / `SmartMatchPage` | Customer Premium | `/api/customer-premium/smart-match`, `/api/customer-premium/smart-match/parse` | Partially verified | Route loads; full premium result path, parsing correction, and booking handoff still pending. | Natural language, structured preferences, ranked real matches, reasons, recovery, and booking handoff pass. |
| Provider comparison | Smart Match comparison panel | Customer Premium | `/api/customer-premium/smart-match/compare` | Partially verified by source/tests only | Physical comparison/select/remove/book not complete. | Up to three providers, consistent matched service, mobile layout and back state verified. |
| Favourites | Provider cards/profile/smart match | Customer | `/api/favorites` | Partially verified by source/tests only | Add/remove/persistence/free-limit not physically verified. | State consistent across profile/search/smart match; backend limits and ownership enforced. |
| Smart rebooking | Profile/bookings premium actions | Customer Premium | `/api/customer-premium/rebooking-options`, bookings API | Foundation only / unverified | Source has entry points; complete old-booking unchanged/current-service data path still pending. | Completed booking selection, current price/duration, confirmation and new booking verified. |
| Earlier-slot alerts | Customer premium alert actions | Customer Premium | `/api/customer-premium/earlier-slot-alerts` | Foundation only / unverified | Create/view/cancel/duplicate prevention not physically verified. | Alert lifecycle works with no automatic reschedule and honest notification capability. |
| Provider Coach | `/provider/ai-coach` | Provider Premium/Platinum | `/api/provider-coach/*`, `/api/provider-premium/*` | Partially verified historically | Needs full current Local QA physical journey after shell fixes. | Daily briefing uses real data, errors retry, assistant avoids invented data. |
| Provider Premium tools | Dashboard/coach/reports | Provider Premium | `/api/provider-premium/*` | Partially verified by automated tests | Physical premium journey not complete. | Schedule suggestions, analytics, retention, promotions, response drafts all work or honestly gate writes. |
| Provider Platinum | `/provider/platinum` / `ProviderPlatinumConsole` | Provider Platinum | `/api/provider-platinum/*` | Partially verified historically | Overview/tabs opened earlier; complete actions, role accounts and assistant writes still pending. | Team, branches, schedule, assign, analytics, reports, exports, assistant verified end to end. |
| Staff role journeys | Platinum role accounts | Provider staff roles | `/api/provider-platinum/*` authorization | Not yet verified in this pass | Must test Manager/Scheduler/Professional/Analyst UI and backend status responses. | UI and backend deny unauthorized actions without leaking data. |
| Notifications/deep links | Bell, OS push, native action route | All | `/api/notifications/*`, Capacitor Push | Visually improved / delivery unverified | Settings card fixed; OS push/deep-link physical verification still pending. | Permission, token, foreground/background/terminated delivery and tap route verified without sensitive lock-screen text. |
| Inbox/conversations | `/inbox`, `ChatSheet` | Customer, Provider | `/api/messages` | Not yet verified in this pass | Need send/retry/context/no duplicate conversation path. | Messages persist, unread state updates, service/booking context correct. |

## Priority 2 - Polish

| Area | Screen | Status | Gap / evidence | Completion criteria |
| --- | --- | --- | --- | --- |
| Profile notification card | `/profile` account tab | Complete for A05 visual fix | Previously raw controls (`Phone notificationsOff`, stray switch); fixed and screenshot captured. | Styled card, clear state, accessible switch and actions, no overflow. |
| Bottom navigation | Global app shell | Complete for A05 visual fix | Previously overlapped Android nav bar; fixed with native Android safe-bottom floor. | Bottom nav remains above system bar on Samsung A05 and does not hide content. |
| Empty states | Home/providers/search/bookings/premium tools | Partially verified | Home no-provider state exists; many screens still need physical audit. | Every empty state gives recovery without fake data. |
| Responsive layouts | 390, 720, 768, 1366, 1920 widths | Pending | Current pass has A05 screenshots only. | No horizontal overflow, clipped controls, hidden modals or desktop phone-shell layouts. |
| Placeholder/fake behaviour | Whole app | Pending audit | Search found mock/payment-test strings and marketing claims; needs classification to avoid false positives. | Unsupported actions are hidden or labelled honestly; no product/shop/cart routes. |

## Current Evidence

- Real app home benchmark: `.codex-real-benchmark-launch-20260729-pulled.png`
- Real app profile benchmark: `.codex-real-benchmark-profile-20260729-pulled.png`
- Local QA pre-fix profile: `.codex-localqa-benchmark-profile-20260729-pulled.png`
- Local QA notification fix: `.codex-localqa-profile-css-fixed-20260729.png`
- Local QA safe-bottom fix: `.codex-localqa-safe-bottom-fixed-20260729.png`

## Open Blockers Before Deployment Readiness

1. Full Customer Free journey is not yet physically complete.
2. Full Customer Premium Smart Match, comparison, favourites, rebooking and earlier-slot journeys are not yet physically complete.
3. Full Provider Free core operations are not yet physically complete.
4. Full Provider Premium journey is not yet physically complete.
5. Full Provider Platinum journey and staff role authorization are not yet physically complete.
6. OS push notification delivery and notification deep links are not yet physically complete.
7. Responsive signed-in verification across required browser viewports is not yet complete.
8. Fresh isolated migration and local QA fixture verification are not yet complete.

# Queless security model

A short, sellable summary of how Queless protects user data. No secret values
appear here — only the names of the variables that must be set on the server.

## Where secrets live
All secrets are read from server-side environment variables only (the live VPS
uses `backend/.env`, never `.env.production`). The frontend/app/APK contain only
public-safe `VITE_*` config — no service-role keys, DB URLs, JWT secret, payment,
or SMS credentials are bundled into the client. `.env` files are git-ignored
(`.gitignore` covers `.env`, `.env.*`, `backend/.env*`, `frontend/.env*`; only
`*.env.example`/`*.env*.template` are tracked, and those hold placeholders).

Required server-side secrets (names only — see `backend/.env.example` for the
full list and format):
`JWT_SECRET`, `DATABASE_URL`, `DATABASE_SSL`, `FIREBASE_SERVICE_ACCOUNT_JSON`,
`RESEND_API_KEY`, `MOBILE_MONEY_WEBHOOK_TOKEN`, and the (currently dormant)
`MTN_*` / `AIRTEL_*` / `AFRICASTALKING_*` credentials. Required public client
config: `VITE_API_URL`, `VITE_BASE_PATH`, `VITE_FIREBASE_*`.

## Authentication
- Passwords hashed with bcrypt; the hash is never logged and never returned in
  any API response (`publicUser()` whitelist + regression test).
- Refresh tokens are random 48-byte values, stored only as SHA-256 hashes; the
  raw refresh token is never logged.
- Login failures use one code path and one message — `Invalid email or password.`
  — for both unknown accounts and wrong passwords (no account enumeration).
- Brute-force defense is layered: per-IP `authRateLimiter` on `/api/auth/*` plus a
  per-account temporary lockout (`loginAttemptGuard`) that survives IP rotation.
  Lockout is temporary and resets on successful login. The guard is in-memory
  today behind a small store interface so it can move to Redis without code
  changes at the call sites.

## Authorization
- All private routes require a valid access token (`protect`).
- Ownership is enforced server-side: providers can only edit their own stand,
  customers can only see their own bookings/messages, providers only see bookings
  /messages tied to their own stand. Roles are enforced in the backend, never by
  hiding UI alone. Covered by `security.integration.test.js` (BOLA cases).
- Public discovery routes return only safe public provider fields (no contact
  details or owner ids).

## Database (Supabase Postgres)
The backend connects with a single pooled `pg` connection and its own custom JWT
auth — requests do not carry per-user Postgres roles. Supabase Row-Level Security
keys off the database role, so RLS is **not** the right enforcement layer for this
architecture (every query would run as the same app role). Enforcement is instead:
backend ownership checks (above), a least-privilege DB user (DML on app tables, no
superuser/DDL in normal operation), no direct DB access from the client, and no
service-role key anywhere in the frontend/app/APK. Integrity is backed by DB
constraints (e.g. NOT NULL + defaults on `barbers`, unique business-name guard,
schedule uniqueness).

## API hardening
- Helmet security headers + strict CSP (no dangerous wildcards).
- CORS restricted to the exact production origins (`https://queless.org`,
  `https://www.queless.org`) and the native app origins (`https://localhost`,
  `capacitor://localhost`); localhost/loopback only outside production.
- Scoped body limits: 1 MB JSON globally, 150 MB only on the image-bearing
  `/api/barbers` and `/api/profiles` routes.
- Per-feature rate limiters (auth, bookings, messages, reviews, search,
  AI coach, OTP, image upload, wallet, support, SMS).
- Production error responses are generic; DB/driver/OS codes and stack traces are
  never exposed (`errorMiddleware`).

## Known residual risk (non-breaking, documented)
- Access tokens are stored in `localStorage` (key `lineup_token`). This keeps
  login persistent and works inside the Capacitor WebView, but is readable by
  any XSS. Mitigations in place: strict CSP, server-side output sanitization, and
  short access-token lifetime with refresh rotation. A future hardening (httpOnly
  refresh cookie + in-memory access token) is the safest next step but is a
  cross-cutting change; it is deliberately not done here to avoid breaking
  persistent login and the APK.

## Payments / SMS
Both are intentionally "coming soon". The frontend gates them off via build flags
(`VITE_ENABLE_PAYMENTS=false`, `VITE_ENABLE_SMS=false`) and the backend rejects
those actions with coming-soon responses. Do not set the live `MTN_*`/`AIRTEL_*`/
`AFRICASTALKING_*` send flags until those features are launched.

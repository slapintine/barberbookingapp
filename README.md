# Queless

A mobile-first service marketplace app with customer accounts, provider profiles, bookings, reviews, messaging, notifications, schedules, maps, and push notification support.

## Tech Stack

- Frontend: Vite, React, Leaflet, Socket.IO client
- Backend: Node.js, Express, Socket.IO, SQLite for local development, PostgreSQL for production
- Auth: JWT with bcrypt password hashing
- Realtime: Socket.IO messages, booking updates, and notification events

## Project Structure

```text
queless/
  backend/      Express API, database setup, Socket.IO server
  frontend/     Vite React app
```

## Requirements

- Node.js 18+
- npm

## Environment Setup

Create local env files from the examples:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

Then update `backend\.env` with a strong `JWT_SECRET`.

Required backend variables:

```text
NODE_ENV=development
PORT=4000
CLIENT_URL=http://localhost:5173
JWT_SECRET=replace-this-with-at-least-32-random-characters
DB_CLIENT=sqlite
DB_PATH=./src/db/barber_app.sqlite
```

For production PostgreSQL, use:

```text
DB_CLIENT=postgres
DATABASE_URL=postgresql://user:password@host:5432/database
DATABASE_SSL=true
```

Required frontend variables:

```text
VITE_API_URL=http://localhost:5000
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=queless-solo.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=queless-solo
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIREBASE_VAPID_KEY=
```

Firebase Cloud Messaging backend variables:

```text
FIREBASE_SERVICE_ACCOUNT_JSON=
RESEND_API_KEY=
```

`VITE_FIREBASE_VAPID_KEY` is the Firebase Web Push certificate public key. `FIREBASE_SERVICE_ACCOUNT_JSON` is the full Firebase Admin service account JSON stored as one backend-only environment variable. Do not put service account JSON or any Admin private key in frontend env files.

Firebase console setup:

1. Project settings > General > Your apps > Web app: copy the web app config into the frontend `VITE_FIREBASE_*` values.
2. Project settings > Cloud Messaging > Web configuration: copy the Web Push certificate public key into `VITE_FIREBASE_VAPID_KEY`.
3. Project settings > Service accounts: generate a private key and store the complete JSON only in backend `FIREBASE_SERVICE_ACCOUNT_JSON`.
4. Serve the built frontend over HTTPS, then verify token registration, foreground test delivery, and background service-worker delivery.

## Africa's Talking SMS Setup

Required backend variables:

```text
AFRICASTALKING_API_KEY=your_api_key
AFRICASTALKING_USERNAME=sandbox
AFRICASTALKING_SHORTCODE=your_shortcode_or_sender_id
AFRICASTALKING_ENV=sandbox
AFRICASTALKING_LIFECYCLE_SMS_ENABLED=false
AFRICASTALKING_SMS_AUTO_REPLY_ENABLED=true
AFRICASTALKING_DEFAULT_AUTO_REPLY=Thank you for contacting Queless. We have received your message.
```

The backend also accepts the older `AFRICAS_TALKING_*` names for compatibility, but use the `AFRICASTALKING_*` names above for new deployments. Never put the API key in frontend env files.

Install dependencies:

```powershell
npm --prefix backend install
```

Run locally:

```powershell
npm run backend:dev
```

Incoming SMS callback URL:

```text
https://YOUR_DOMAIN/api/sms/incoming
```

For ngrok local testing:

```powershell
ngrok http 5000
```

Then paste this in the Africa's Talking incoming SMS callback dashboard:

```text
https://YOUR_NGROK_URL/api/sms/incoming
```

Production callback:

```text
https://queless.org/api/sms/incoming
```

Test JSON incoming SMS:

```powershell
curl -X POST http://localhost:5000/api/sms/incoming `
  -H "Content-Type: application/json" `
  -d '{ "from":"+256700000000", "to":"12345", "text":"hello", "date":"2026-05-22" }'
```

Test form-encoded incoming SMS:

```powershell
curl -X POST http://localhost:5000/api/sms/incoming `
  -H "Content-Type: application/x-www-form-urlencoded" `
  -d "from=%2B256700000000&to=12345&text=hello&date=2026-05-22"
```

Outgoing SMS is protected and admin-only:

```powershell
curl -X POST http://localhost:5000/api/sms/send `
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{ "to":"+256700000000", "message":"Your Queless booking has been confirmed." }'
```

Lifecycle SMS fallback is opt-in with `AFRICASTALKING_LIFECYCLE_SMS_ENABLED=true`. When enabled, Queless sends SMS only after push delivery reports no delivered device token for must-not-miss events: provider booking creation, customer booking acceptance/rejection/cancellation/completion, booking payment success/failure, wallet top-up success/failure, paid-booking alerts, and terminal provider withdrawal alerts. These sends reuse `sms_messages`, appear in the admin SMS monitor, and use deterministic dedupe keys so repeated webhooks/status checks do not send duplicate texts.

Sandbox notes:

- Use `AFRICASTALKING_USERNAME=sandbox` and `AFRICASTALKING_ENV=sandbox`.
- Sandbox success confirms local wiring, not production readiness.
- Do not deploy production with sandbox username or sandbox env.

Production checklist:

- Set `AFRICASTALKING_USERNAME` to the production username.
- Set `AFRICASTALKING_ENV=production`.
- Set `AFRICASTALKING_SHORTCODE` to an approved shortcode or sender ID.
- Set `AFRICASTALKING_LIFECYCLE_SMS_ENABLED=true` only after account balance, sender approval, and customer/provider phone data are ready.
- Confirm `/api/sms/incoming` is publicly reachable over HTTPS.
- Confirm admin-only SMS sending works and non-admin users receive 403.

Troubleshooting:

- If incoming SMS does not appear, confirm the callback URL and that the backend can write to the database.
- If outgoing SMS fails, confirm the API key, username, shortcode, account balance, and production/sandbox mode.
- Duplicate webhook events are ignored by provider message ID or a hash of sender, recipient, text, and timestamp.

## Install

Install backend and frontend dependencies:

```powershell
npm --prefix backend install
npm --prefix frontend install
```

## Run Locally

Start the backend:

```powershell
npm run backend:dev
```

Start the frontend in another terminal:

```powershell
npm run frontend:dev
```

Default URLs:

- API: `http://localhost:4000`
- Frontend: `http://localhost:5173`

## Checks

Run backend syntax check:

```powershell
npm run backend:check
```

Build the frontend:

```powershell
npm run frontend:build
```

Run both:

```powershell
npm run check
```

## Database

Local development defaults to SQLite so the app can run without external services.

Production should use PostgreSQL:

1. Create a PostgreSQL database on Supabase, Neon, Railway, Render, AWS RDS, or another managed provider.
2. Set `DB_CLIENT=postgres`.
3. Set `DATABASE_URL` to the provider connection string.
4. Set `DATABASE_SSL=true` for managed cloud databases that require TLS.
5. Install backend dependencies after pulling this change:

```powershell
npm --prefix backend install
```

Run migrations:

```powershell
npm run backend:db:migrate
```

The production schema lives in:

```text
backend/src/db/migrations/postgres/
```

## Production Notes

Before launch:

- Set `NODE_ENV=production`.
- Set `CLIENT_URL` to the deployed frontend URL. For multiple URLs, use a comma-separated list.
- Use a long random `JWT_SECRET` and keep it out of source control.
- Use PostgreSQL in production and run migrations during deploy.
- Enable automated backups on the managed PostgreSQL provider.
- Store uploaded images in object storage such as Cloudinary, S3, or Supabase Storage.
- Add automated tests for auth, booking conflicts, schedules, reviews, and messaging permissions.
- Put the API behind HTTPS and a reverse proxy or managed platform.

## Queless Domain Migration

Production targets:

- Production domain: `https://queless.org`
- Backend API: `https://queless.org/api`
- Frontend production env: `VITE_APP_URL=https://queless.org`, `VITE_FRONTEND_URL=https://queless.org`, `VITE_API_BASE_URL=https://queless.org/api`, `VITE_PUBLIC_URL=https://queless.org`
- Backend production env: `APP_URL=https://queless.org`, `FRONTEND_URL=https://queless.org`, `CLIENT_URL=https://queless.org,https://www.queless.org`, `BASE_URL=https://queless.org`, `API_BASE_URL=https://queless.org/api`

Server and provider setup still required:

- DNS: create `A` records for `@` and `www` that point to the VPS IP.
- SSL: issue certificates for both `queless.org` and `www.queless.org`.
- Payment callbacks: register `https://queless.org/api/payments/mtn/callback`, `https://queless.org/api/payments/webhooks/mtn`, `https://queless.org/api/payments/airtel/callback`, and `https://queless.org/api/payments/webhooks/airtel` with the payment providers that support them.
- Firebase/Auth: add authorized domains and redirect origins for `queless.org` and `www.queless.org`.
- Old-domain redirect: after `queless.org` is tested, configure any retired legacy domains to redirect permanently to `https://queless.org`.

## Current Production Foundation

This app includes:

- Required environment validation at server startup
- Restricted production CORS
- Basic security headers
- API and auth rate limiting
- Structured request logging
- Health endpoints

Next recommended engineering pass: split the large frontend `App.jsx` into API modules, hooks, pages, and reusable components.

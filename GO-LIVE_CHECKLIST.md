# GO-LIVE Checklist

This checklist prepares Queless for `https://queless.org/` without bypassing the deployment gate or faking external service success.

## 1. Backend Production Env

Copy `deploy/backend.production.env.template` to the backend `.env` on the VPS and fill real secret values.

Required production values:

```env
NODE_ENV=production
PORT=5000
HOST=127.0.0.1
LOG_LEVEL=info
APP_PUBLIC_URL=https://queless.org
APP_URL=https://queless.org
FRONTEND_URL=https://queless.org
BASE_URL=https://queless.org
API_BASE_URL=https://queless.org/api
CLIENT_URL=https://queless.org,https://www.queless.org
DEV_CLIENT_URL=
ALLOW_LOCAL_DEV_ORIGINS=false
JWT_SECRET=replace-with-a-32-plus-character-random-secret
DB_CLIENT=postgres
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:5432/DATABASE_NAME
DATABASE_SSL=true
FIREBASE_SERVICE_ACCOUNT_JSON=
AFRICASTALKING_USERNAME=
AFRICASTALKING_API_KEY=
AFRICASTALKING_SHORTCODE=
AFRICASTALKING_ENV=production
AFRICASTALKING_LIFECYCLE_SMS_ENABLED=false
BOOKING_ONLINE_PAYMENTS_ENABLED=false
MOBILE_MONEY_MODE=provider
ENABLE_MOCK_PAYMENTS=false
MOBILE_MONEY_DEFAULT_PROVIDER=mtn
MOBILE_MONEY_CURRENCY=UGX
MOBILE_MONEY_CALLBACK_URL=https://queless.org/api/payments/mtn/callback
MTN_CALLBACK_URL=https://queless.org/api/payments/mtn/callback
MTN_WEBHOOK_URL=https://queless.org/api/payments/webhooks/mtn
AIRTEL_CALLBACK_URL=https://queless.org/api/payments/airtel/callback
AIRTEL_WEBHOOK_URL=https://queless.org/api/payments/webhooks/airtel
MTN_BASE_URL=
MTN_TARGET_ENVIRONMENT=
MTN_API_USER_ID=
MTN_API_KEY=
MTN_COLLECTION_SUBSCRIPTION_KEY=
MTN_DISBURSEMENT_SUBSCRIPTION_KEY=
MTN_COLLECTION_URL=
MTN_VERIFICATION_URL=
MTN_DISBURSEMENT_URL=
```

Keep `BOOKING_ONLINE_PAYMENTS_ENABLED=false` until live MTN initiation, status, and callback have been proven.

## 2. Frontend Production Env

Copy `deploy/frontend.production.env.template` to `frontend/.env.production` before building.

```env
VITE_APP_URL=https://queless.org/app
VITE_FRONTEND_URL=https://queless.org/app
VITE_API_BASE_URL=https://queless.org/api
VITE_PUBLIC_URL=https://queless.org/app
VITE_API_URL=https://queless.org/api
VITE_BASE_PATH=/app/
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIREBASE_VAPID_KEY=
```

`VITE_API_URL` must include `/api` so the app uses `https://queless.org/api/...` in production.

## 3. PostgreSQL Setup

1. Create a PostgreSQL database and least-privilege app user.
2. Set `DB_CLIENT=postgres` and `DATABASE_URL` in backend `.env`.
3. Set `DATABASE_SSL=true` for managed Postgres, or `false` only for local/private Postgres where TLS is not used.
4. Back up the existing SQLite file before any import.
5. Run migrations:

```bash
npm --prefix backend run db:migrate
```

6. If importing existing SQLite data into a prepared PostgreSQL database, run:

```bash
DB_CLIENT=postgres DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:5432/DATABASE_NAME DB_PATH=./src/db/barber_app.sqlite npm --prefix backend run db:import-sqlite
```

The importer runs in a transaction, uses `ON CONFLICT (id) DO NOTHING`, and preserves provider, subscription, booking, payment, customer subscription, wallet, notification, schedule, review, favorite, message, and audit rows covered by the current schema. Use it for a new or intentionally prepared PostgreSQL database; do not point it at unrelated production data.

## 4. Public Provider Setup

Do not create fake production providers.

Run the provider visibility audit:

```bash
npm --prefix backend run audit:provider-readiness
```

A real provider is public only when:

- the business is not soft-deleted and is not demo/test data
- `business_status` is `active`, `approved`, or `live`
- `is_published=1`
- plan is `PRO`, `PREMIUM`, or `PLATINUM`
- there is an active unexpired subscription, an active unexpired trial, or explicit admin approval
- required business fields are present
- at least one service/category is configured

Admin can also review this in the Admin Panel under Deployment Readiness.

## 5. MTN Live Readiness

Routes to verify:

- `GET /api/payments/mtn/health`
- `POST /api/payments/mtn/initiate`
- `GET /api/payments/mtn/status/:reference`
- `POST /api/payments/mtn/callback`
- `GET /api/payments/mtn/check-auth`

Required before enabling live online booking payments:

1. Fill MTN production or approved sandbox credentials.
   `MTN_API_USER_ID` must contain the MTN API user ID. Do not put the API user ID in `MTN_API_SECRET` or `MOBILE_MONEY_API_SECRET`; those secret fields are not accepted as user-id fallbacks.
2. Confirm callback URL is registered as `https://queless.org/api/payments/mtn/callback`.
3. Run admin auth check and confirm MTN auth succeeds.
4. Initiate a real test payment and approve the phone prompt.
5. Confirm status transitions remain pending until provider confirmation.
6. Confirm success credits the correct booking/wallet once.
7. Re-send the same callback and confirm idempotency: no duplicate credit, no status downgrade.
8. Confirm failed and pending callbacks do not mark payments successful.
9. Only then set `BOOKING_ONLINE_PAYMENTS_ENABLED=true`.

## 6. Firebase Live Readiness

Routes to verify:

- `POST /api/notifications/register-token`
- `POST /api/notifications/unregister-token`
- `POST /api/notifications/test`

Setup steps:

1. In Firebase Console, open the production project, then Project settings > General > Your apps > Web app. Register a web app if one does not exist, using the production app domain such as `queless.org`.
2. Copy the web app config into the frontend build env: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, and optional `VITE_FIREBASE_MEASUREMENT_ID`.
3. In Project settings > Cloud Messaging > Web configuration, create or copy the Web Push certificate key pair public key into `VITE_FIREBASE_VAPID_KEY`.
4. In Project settings > Service accounts, generate a new private key for the backend service account and store the complete JSON only in backend `FIREBASE_SERVICE_ACCOUNT_JSON`.
5. Never put Firebase Admin credentials, private keys, or service account JSON in frontend env or built assets.
6. Build frontend and serve it over HTTPS.
7. Log in as a real user, grant notification permission, and confirm `POST /api/notifications/register-token` succeeds.
8. Send `POST /api/notifications/test` for that account and confirm foreground delivery while the app tab is open.
9. Close or background the app tab, send another test, and confirm the service worker shows the notification and opens the app route on click.
10. Trigger booking/payment notifications and confirm failures are logged but do not break booking/payment flows.
11. Unregister token and confirm cleanup succeeds.

## 7. Deployment Verification

Run locally and on the VPS after env is filled:

```bash
npm run verify:launch
```

Live checks:

```bash
curl -i https://queless.org/api/health
curl -i https://queless.org/api/health/ready
curl -i https://queless.org/api/payments/mtn/health
curl -i https://queless.org/api/barbers
```

`verify:launch` must return `GO` before traffic is considered launch-ready.

## 8. Rollback Notes

Before deploy:

- back up PostgreSQL
- back up the old SQLite file if importing
- keep the previous PM2 release path or Git commit available
- keep the previous frontend `dist` available
- verify Nginx config before reload with `sudo nginx -t`

Rollback:

1. Repoint the current symlink or Git checkout to the previous release.
2. Restore the previous backend `.env` if needed.
3. Restart PM2.
4. Reload Nginx only after `sudo nginx -t`.
5. If database migration caused the incident, restore from PostgreSQL backup instead of hand-editing production rows.

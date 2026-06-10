# Same-Domain Production Deployment

## Updated Live Layout

Use one domain with the marketing website at the root and the Queless booking app under `/app`:

- Marketing site: `https://queless.org/`
- Booking app: `https://queless.org/app/`
- Backend API: `https://queless.org/api/...`
- Socket.IO: `https://queless.org/socket.io/...`

Expected server folders:

```text
/var/www/queless.org/current/
|-- backend/
|-- frontend/
|   `-- dist/
|-- line-up-barber-website/
|   `-- dist/
|-- deploy/
`-- ecosystem.config.cjs
```

Build commands before switching Nginx:

```bash
cd /var/www/queless.org/current
npm install
npm --prefix backend install
npm --prefix frontend install
cp frontend/.env.production.example frontend/.env.production
npm run verify:launch
```

For a production launch, do not use `MOBILE_MONEY_MODE=mock` when online booking payments are enabled. Keep `BOOKING_ONLINE_PAYMENTS_ENABLED=false` for cash-only launch, or configure live/sandbox/provider MTN credentials and confirm `/api/payments/mtn/health` before enabling MTN Mobile Money.

## Firebase Cloud Messaging

Production push notifications require these frontend env values before `npm run frontend:build`:

```text
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=queless-solo.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=queless-solo
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_FIREBASE_VAPID_KEY=
```

The backend needs:

```text
FIREBASE_SERVICE_ACCOUNT_JSON=
RESEND_API_KEY=
```

Store `FIREBASE_SERVICE_ACCOUNT_JSON` only on the backend as the complete Firebase Admin service account JSON. If the JSON is stored as a single line, keep escaped newlines in `private_key`; the backend converts them before initializing Firebase Admin. Do not configure `VAPID_PRIVATE_KEY` for Firebase Cloud Messaging.

Firebase Console steps:

1. Project settings > General > Your apps > Web app: register or open the production web app and copy its config into the frontend `VITE_FIREBASE_*` values.
2. Project settings > Cloud Messaging > Web configuration: create or copy the Web Push certificate public key into `VITE_FIREBASE_VAPID_KEY`.
3. Project settings > Service accounts: generate a private key and store the complete JSON only in backend `FIREBASE_SERVICE_ACCOUNT_JSON`.
4. Rebuild the frontend after setting frontend env values, then verify token registration plus foreground and background test delivery over HTTPS.

## Launch Gate

Before switching traffic, run the deployment readiness gate:

```bash
cd /var/www/queless.org/current
npm run verify:launch
```

The launch verification command runs backend checks, backend tests, database migrations, frontend tests, the production frontend build, provider publication audit, demo/test business audit, and the authoritative deployment readiness gate. It stops on the first failing blocker and prints the final Queless launch decision as `GO` or `NO_GO` without exposing secrets. A `NO_GO` must be cleared before launch when it reports blocker checks, especially:

- demo/test business records still visible in production data
- zero real public business listings
- missing JWT, exact public URL, production CORS allowlist, database, or MTN callback configuration
- `APP_PUBLIC_URL` not set to `https://queless.org`
- `CLIENT_URL` missing `https://queless.org` or `https://www.queless.org`, or production still allowing localhost/dev origins
- `DB_CLIENT` is anything other than `postgres` in production
- online booking payments enabled while mobile money is still mocked
- missing `MTN_API_USER_ID` for MTN MoMo API-user credentials; secret fields such as `MTN_API_SECRET` and `MOBILE_MONEY_API_SECRET` are not accepted as user-id fallbacks
- MTN online payments enabled before auth succeeds against the configured MTN environment
- missing or invalid backend `FIREBASE_SERVICE_ACCOUNT_JSON` when production push delivery is part of launch
- unpaid/expired Customer Premium or unsafe Provider Platinum fallback rows that could affect paid-feature access

Demo cleanup is dry-run by default. To soft-disable confirmed demo/test providers from the CLI:

```bash
ALLOW_PRODUCTION_DEMO_CLEANUP=true npm --prefix backend run cleanup:demo-businesses
```

This only unpublishes suspect businesses and marks them deleted. It does not delete users, bookings, payments, or audit history.

Admins can also review the same gate in the Admin Panel under `Settings -> Deployment Readiness`. The panel shows exact blockers first, then the live checks, demo/test suspects, paid-feature safety rows, MTN route/auth state, and a confirmed soft-disable action.

For the final operator checklist, env templates, migration order, live MTN/Firebase steps, and rollback notes, see `GO-LIVE_CHECKLIST.md`.

## PostgreSQL Cutover

Production must run with PostgreSQL:

```env
DB_CLIENT=postgres
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:5432/DATABASE_NAME
DATABASE_SSL=true
```

Run migrations before starting PM2:

```bash
cd /var/www/queless.org/current
npm --prefix backend run db:migrate
```

If you need to import data from the old SQLite database into a new PostgreSQL database, back up both databases first, point `DB_PATH` at the SQLite file, then run:

```bash
DB_CLIENT=postgres DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:5432/DATABASE_NAME DB_PATH=./src/db/barber_app.sqlite npm --prefix backend run db:import-sqlite
```

The importer runs inside a transaction and uses `ON CONFLICT (id) DO NOTHING`; it does not overwrite existing rows. Use it only for a new or intentionally prepared PostgreSQL database, then run the deployment gate again.

## Public Provider Setup

Do not create fake public providers for launch. A provider becomes public only when all of these are true:

- the business is not soft-deleted and is not marked as demo/test data
- `business_status` is `active`, `approved`, or `live`
- `is_published=1`
- `subscription_tier` is `FREE`, `PREMIUM`, or `PLATINUM`
- the provider has an active non-expired subscription, an active non-expired trial, or explicit admin approval

Production setup path:

1. Provider signs up and creates a real business profile with services, location, and business details.
2. Provider starts a real trial or completes a real subscription payment, or an admin manually approves the provider in the admin provider/subscription tools.
3. Admin verifies the business is published and not demo/test data.
4. Confirm `GET https://queless.org/api/barbers` and `GET https://queless.org/api/marketplace/providers` return at least one real provider.
5. Run `npm --prefix backend run check:deployment`; `public_businesses` must pass before launch.

This repo is prepared for a same-origin production setup on one domain:

- Frontend: `https://queless.org/app/`
- Backend API: `https://queless.org/api/...`
- Socket.IO: `https://queless.org/socket.io/...`
- Backend process: private on `127.0.0.1:5000`
- Reverse proxy: Nginx
- Process manager: PM2

The frontend uses `VITE_API_URL=https://queless.org/api`, and the backend already listens on `/socket.io` for Socket.IO.

## Namecheap DNS

Use `Namecheap BasicDNS` for `queless.org`.

Create these `A` records:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A Record | `@` | `162.0.231.19` | Automatic |
| A Record | `www` | `162.0.231.19` | Automatic |

Recommended cleanup:

- Remove any conflicting `A`, `AAAA`, or `CNAME` records for `@` and `www`
- Keep Namecheap nameservers set to `BasicDNS`

DNS checks:

```bash
nslookup queless.org
nslookup www.queless.org
```

Both names should resolve to `162.0.231.19`.

## Server Folder Structure

Use this layout on the VPS:

```text
/var/www/queless.org/
|-- current/
|   |-- backend/
|   |   |-- .env
|   |   |-- package.json
|   |   `-- src/
|   |-- frontend/
|   |   |-- .env.production
|   |   |-- dist/
|   |   `-- src/
|   |-- deploy/
|   |-- ecosystem.config.cjs
|   `-- package.json
`-- shared/
    `-- logs/
        `-- pm2/
```

## Production Environment Files

### Backend

Create `/var/www/queless.org/current/backend/.env`:

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
DATABASE_URL=postgresql://USERNAME:PASSWORD@127.0.0.1:5432/DATABASE_NAME
DATABASE_SSL=false

FIREBASE_SERVICE_ACCOUNT_JSON=

RESEND_API_KEY=
RESEND_FROM_EMAIL=

AFRICASTALKING_USERNAME=
AFRICASTALKING_API_KEY=
AFRICASTALKING_SHORTCODE=
AFRICASTALKING_ENV=production
AFRICASTALKING_LIFECYCLE_SMS_ENABLED=false

BOOKING_ONLINE_PAYMENTS_ENABLED=false
BOOKING_WALLET_PAYMENTS_ENABLED=true
PROVIDER_FREE_TRIALS_ENABLED=false
MOBILE_MONEY_MODE=provider
ENABLE_MOCK_PAYMENTS=false
MOBILE_MONEY_DEFAULT_PROVIDER=mtn
MOBILE_MONEY_API_KEY=
MOBILE_MONEY_API_SECRET=
MOBILE_MONEY_COLLECTION_URL=
MOBILE_MONEY_VERIFICATION_URL=
MOBILE_MONEY_DISBURSEMENT_URL=
MOBILE_MONEY_CALLBACK_URL=https://queless.org/api/payments/mtn/callback
MTN_CALLBACK_URL=https://queless.org/api/payments/mtn/callback
MTN_WEBHOOK_URL=https://queless.org/api/payments/webhooks/mtn
AIRTEL_CALLBACK_URL=https://queless.org/api/payments/airtel/callback
AIRTEL_WEBHOOK_URL=https://queless.org/api/payments/webhooks/airtel
MTN_CONSUMER_KEY=
MTN_CONSUMER_SECRET=
MTN_COUNTRY=Uganda
MTN_SUBSCRIPTION_KEY=
MTN_API_USER_ID=
MTN_COLLECTION_PRIMARY_KEY=
MTN_COLLECTION_SECONDARY_KEY=
MOBILE_MONEY_WEBHOOK_TOKEN=

MTN_API_KEY=
# Secret/password-style value. This is not used as the MTN API user ID.
MTN_API_SECRET=
MTN_COLLECTION_URL=
MTN_VERIFICATION_URL=
MTN_DISBURSEMENT_URL=

AIRTEL_API_KEY=
AIRTEL_API_SECRET=
AIRTEL_COLLECTION_URL=
AIRTEL_VERIFICATION_URL=
AIRTEL_DISBURSEMENT_URL=
```

### Frontend

Create `/var/www/queless.org/current/barber-booking-app/frontend/.env.production`:

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

Use the explicit `/api` URL so the built app calls the backend API, not the marketing root:

- `/api/...` for backend HTTP
- `/socket.io/...` for Socket.IO

## Exact Commands

### Local Machine Commands

Run these on your local machine before pushing or copying code to the VPS:

```bash
cd barber-booking-app
npm install
npm --prefix backend install
npm --prefix frontend install
npm run backend:check
npm run frontend:build
```

If you are deploying by Git:

```bash
git add .
git commit -m "Prepare same-domain production deployment"
git push
```

If you are copying files manually instead of Git, copy the whole project to:

```text
/var/www/queless.org/current
```

### VPS Commands

Run these on the Ubuntu or Debian VPS.

#### 1. Install system packages

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

#### 2. Create app directories

```bash
sudo mkdir -p /var/www/queless.org/shared/logs/pm2
sudo mkdir -p /var/www/certbot
sudo chown -R $USER:$USER /var/www/queless.org
sudo chown -R $USER:$USER /var/www/certbot
```

#### 3. Put the project on the server

If deploying by Git:

```bash
cd /var/www/queless.org
git clone YOUR_REPOSITORY_URL current
```

If the folder already exists and you are updating it:

```bash
cd /var/www/queless.org/current
git pull
```

#### 4. Install Node dependencies

```bash
cd /var/www/queless.org/current
npm install
npm --prefix backend install
npm --prefix frontend install
```

#### 5. Create production env files

```bash
cp backend/.env.production.example backend/.env
cp frontend/.env.production.example frontend/.env.production
nano backend/.env
nano frontend/.env.production
```

#### 6. Build the frontend

```bash
cd /var/www/queless.org/current
npm run frontend:build
```

This produces the live frontend in:

```text
/var/www/queless.org/current/frontend/dist
```

#### 7. Start the backend with PM2

```bash
cd /var/www/queless.org/current
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd
```

After `pm2 startup systemd`, run the extra command PM2 prints to finish startup registration.

Useful PM2 commands:

```bash
pm2 status
pm2 logs Queless-backend
pm2 restart Queless-backend
pm2 save
```

#### 8. Install the bootstrap Nginx config

```bash
sudo cp /var/www/queless.org/current/deploy/nginx/queless.org.bootstrap.conf /etc/nginx/sites-available/queless.org.conf
sudo ln -sf /etc/nginx/sites-available/queless.org.conf /etc/nginx/sites-enabled/queless.org.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

At this stage:

- `http://queless.org` should load the frontend
- `http://queless.org/api/health` should proxy to the backend
- `http://queless.org/socket.io/...` should reach Socket.IO through Nginx

#### 9. Issue SSL certificates with Certbot

```bash
sudo certbot --nginx -d queless.org -d www.queless.org
```

#### 10. Replace bootstrap Nginx with final HTTPS config

```bash
sudo cp /var/www/queless.org/current/deploy/nginx/queless.org.conf /etc/nginx/sites-available/queless.org.conf
sudo nginx -t
sudo systemctl reload nginx
```

## Nginx Behavior

The committed Nginx config already provides:

- frontend static hosting from `frontend/dist`
- React SPA fallback with `try_files $uri $uri/ /index.html`
- no-store caching for HTML and `/app/version.json`, so users do not keep old app shells after a deploy
- immutable caching only for hashed `/app/assets/*` build files
- reverse proxy from `/api/` to `http://127.0.0.1:5000/api/`
- reverse proxy from `/socket.io/` to `http://127.0.0.1:5000/socket.io/`
- HTTPS termination with Lets Encrypt certs

Files:

- [queless.org.bootstrap.conf](C:\Users\User\Documents\Codex\2026-04-19-files-mentioned-by-the-user-barber\barber-booking-app\deploy\nginx\queless.org.bootstrap.conf)
- [queless.org.conf](C:\Users\User\Documents\Codex\2026-04-19-files-mentioned-by-the-user-barber\barber-booking-app\deploy\nginx\queless.org.conf)

## How the App Uses `/api`

The frontend config already supports the required `/app` plus `/api` setup:

- [api.js](C:\Users\User\Documents\Codex\2026-04-19-files-mentioned-by-the-user-barber\barber-booking-app\frontend\src\config\api.js)
- [vite.config.js](C:\Users\User\Documents\Codex\2026-04-19-files-mentioned-by-the-user-barber\barber-booking-app\frontend\vite.config.js)
- [server.js](C:\Users\User\Documents\Codex\2026-04-19-files-mentioned-by-the-user-barber\barber-booking-app\backend\src\server.js)

Production behavior:

- `VITE_API_URL=https://queless.org/api` means frontend requests resolve to `https://queless.org/api/...`
- Socket.IO connects on the same origin using `/socket.io`
- backend listens only on `127.0.0.1:5000`
- Nginx exposes the public HTTPS endpoints

## Verification Commands

Run these on the VPS after deployment:

```bash
curl -I http://queless.org
curl http://queless.org/api/health
curl -I https://queless.org
curl https://queless.org/api/health
curl https://queless.org/app/version.json
pm2 status
pm2 logs Queless-backend --lines 50
sudo nginx -t
sudo certbot certificates
```

Browser checks:

1. Open `https://queless.org`
2. Open browser DevTools
3. Confirm frontend requests hit `/api/...` on the same origin
4. Refresh a non-root React route and confirm it still works
5. Confirm Socket.IO connects successfully
6. Log in and confirm authenticated API requests still work
7. Confirm `https://queless.org/app/version.json` matches the deployed Git commit

## Update Workflow

When you push a new version:

```bash
cd /var/www/queless.org/current
git status --short --branch
git pull
npm install
npm --prefix backend install
npm --prefix frontend install
npm run backend:db:migrate
npm run frontend:build
test -f frontend/dist/version.json && cat frontend/dist/version.json
sudo nginx -t
sudo systemctl reload nginx
pm2 restart Queless-backend
```

`vite build` clears `frontend/dist` before writing the new hashed assets. If you build elsewhere and copy files manually, remove the old target first:

```bash
rm -rf /var/www/queless.org/current/barber-booking-app/frontend/dist/*
cp -a /path/to/new/dist/. /var/www/queless.org/current/barber-booking-app/frontend/dist/
sudo systemctl reload nginx
pm2 restart Queless-backend
```

## Required Values You Still Need To Supply

You still need real production values for:

1. `JWT_SECRET`
2. PostgreSQL database credentials
3. MTN and Airtel mobile money provider credentials if using live payments
4. email and push notification credentials if those features are going live

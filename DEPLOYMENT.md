# Same-Domain Production Deployment

## Updated Live Layout

Use one domain with the marketing website at the root and the booking app under `/app`:

- Website: `https://lineupbarberbooking.org/`
- Booking app: `https://lineupbarberbooking.org/app/`
- Backend API: `https://lineupbarberbooking.org/api/...`
- Socket.IO: `https://lineupbarberbooking.org/socket.io/...`

Expected server folders:

```text
/var/www/lineupbarberbooking.org/current/
|-- line-up-barber-website/
|   `-- dist/
`-- barber-booking-app/
    |-- backend/
    |-- frontend/
    |   `-- dist/
    |-- deploy/
    `-- ecosystem.config.cjs
```

Build commands before switching Nginx:

```bash
cd /var/www/lineupbarberbooking.org/current/line-up-barber-website
npm install
npm run build

cd /var/www/lineupbarberbooking.org/current/barber-booking-app
npm install
npm --prefix backend install
npm --prefix frontend install
cp frontend/.env.production.example frontend/.env.production
npm run frontend:build
npm run backend:check
```

For the non-payment launch, keep `MOBILE_MONEY_MODE=mock` and use cash bookings. Live payment credentials can be added later.

This repo is prepared for a same-origin production setup on one domain:

- Frontend: `https://lineupbarberbooking.org`
- Backend API: `https://lineupbarberbooking.org/api/...`
- Socket.IO: `https://lineupbarberbooking.org/socket.io/...`
- Backend process: private on `127.0.0.1:5000`
- Reverse proxy: Nginx
- Process manager: PM2

The frontend already supports same-origin API usage when `VITE_API_URL` is blank, and the backend already listens on `/socket.io` for Socket.IO.

## Namecheap DNS

Use `Namecheap BasicDNS` for `lineupbarberbooking.org`.

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
nslookup lineupbarberbooking.org
nslookup www.lineupbarberbooking.org
```

Both names should resolve to `162.0.231.19`.

## Server Folder Structure

Use this layout on the VPS:

```text
/var/www/lineupbarberbooking.org/
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

Create `/var/www/lineupbarberbooking.org/current/backend/.env`:

```env
NODE_ENV=production
PORT=5000
HOST=127.0.0.1
LOG_LEVEL=info

APP_PUBLIC_URL=https://lineupbarberbooking.org
CLIENT_URL=https://lineupbarberbooking.org,https://www.lineupbarberbooking.org
JWT_SECRET=replace-with-a-32-plus-character-random-secret

DB_CLIENT=postgres
DATABASE_URL=postgresql://USERNAME:PASSWORD@127.0.0.1:5432/DATABASE_NAME
DATABASE_SSL=false

VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@lineupbarberbooking.org

RESEND_API_KEY=
RESEND_FROM_EMAIL=

AFRICAS_TALKING_USERNAME=
AFRICAS_TALKING_API_KEY=

PESAPAL_CONSUMER_KEY=
PESAPAL_CONSUMER_SECRET=
PESAPAL_IPN_ID=
PESAPAL_CALLBACK_URL=https://lineupbarberbooking.org
PESAPAL_BASE_URL=https://pay.pesapal.com/v3
PESAPAL_ENVIRONMENT=live
PESAPAL_CURRENCY=UGX

MOBILE_MONEY_MODE=provider
MOBILE_MONEY_DEFAULT_PROVIDER=mtn
MOBILE_MONEY_API_KEY=
MOBILE_MONEY_API_SECRET=
MOBILE_MONEY_COLLECTION_URL=
MOBILE_MONEY_VERIFICATION_URL=
MOBILE_MONEY_DISBURSEMENT_URL=
MOBILE_MONEY_CALLBACK_URL=https://lineupbarberbooking.org/api/payments/mtn/callback
MTN_CALLBACK_URL=https://lineupbarberbooking.org/api/payments/mtn/callback
MTN_CONSUMER_KEY=
MTN_CONSUMER_SECRET=
MTN_COUNTRY=Uganda
MTN_SUBSCRIPTION_KEY=
MTN_API_USER=
MTN_COLLECTION_PRIMARY_KEY=
MTN_COLLECTION_SECONDARY_KEY=
MOBILE_MONEY_WEBHOOK_TOKEN=

MTN_API_KEY=
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

Create `/var/www/lineupbarberbooking.org/current/frontend/.env.production`:

```env
VITE_API_URL=
```

Leave it blank so the built app calls the same origin:

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
/var/www/lineupbarberbooking.org/current
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
sudo mkdir -p /var/www/lineupbarberbooking.org/shared/logs/pm2
sudo mkdir -p /var/www/certbot
sudo chown -R $USER:$USER /var/www/lineupbarberbooking.org
sudo chown -R $USER:$USER /var/www/certbot
```

#### 3. Put the project on the server

If deploying by Git:

```bash
cd /var/www/lineupbarberbooking.org
git clone YOUR_REPOSITORY_URL current
```

If the folder already exists and you are updating it:

```bash
cd /var/www/lineupbarberbooking.org/current
git pull
```

#### 4. Install Node dependencies

```bash
cd /var/www/lineupbarberbooking.org/current
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
cd /var/www/lineupbarberbooking.org/current
npm run frontend:build
```

This produces the live frontend in:

```text
/var/www/lineupbarberbooking.org/current/frontend/dist
```

#### 7. Start the backend with PM2

```bash
cd /var/www/lineupbarberbooking.org/current
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd
```

After `pm2 startup systemd`, run the extra command PM2 prints to finish startup registration.

Useful PM2 commands:

```bash
pm2 status
pm2 logs lineup-backend
pm2 restart lineup-backend
pm2 save
```

#### 8. Install the bootstrap Nginx config

```bash
sudo cp /var/www/lineupbarberbooking.org/current/deploy/nginx/lineupbarberbooking.org.bootstrap.conf /etc/nginx/sites-available/lineupbarberbooking.org.conf
sudo ln -sf /etc/nginx/sites-available/lineupbarberbooking.org.conf /etc/nginx/sites-enabled/lineupbarberbooking.org.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

At this stage:

- `http://lineupbarberbooking.org` should load the frontend
- `http://lineupbarberbooking.org/api/health` should proxy to the backend
- `http://lineupbarberbooking.org/socket.io/...` should reach Socket.IO through Nginx

#### 9. Issue SSL certificates with Certbot

```bash
sudo certbot --nginx -d lineupbarberbooking.org -d www.lineupbarberbooking.org
```

#### 10. Replace bootstrap Nginx with final HTTPS config

```bash
sudo cp /var/www/lineupbarberbooking.org/current/deploy/nginx/lineupbarberbooking.org.conf /etc/nginx/sites-available/lineupbarberbooking.org.conf
sudo nginx -t
sudo systemctl reload nginx
```

## Nginx Behavior

The committed Nginx config already provides:

- frontend static hosting from `frontend/dist`
- React SPA fallback with `try_files $uri $uri/ /index.html`
- reverse proxy from `/api/` to `http://127.0.0.1:5000/api/`
- reverse proxy from `/socket.io/` to `http://127.0.0.1:5000/socket.io/`
- HTTPS termination with Lets Encrypt certs

Files:

- [lineupbarberbooking.org.bootstrap.conf](C:\Users\User\Documents\Codex\2026-04-19-files-mentioned-by-the-user-barber\barber-booking-app\deploy\nginx\lineupbarberbooking.org.bootstrap.conf)
- [lineupbarberbooking.org.conf](C:\Users\User\Documents\Codex\2026-04-19-files-mentioned-by-the-user-barber\barber-booking-app\deploy\nginx\lineupbarberbooking.org.conf)

## How the App Uses Same-Origin `/api`

The frontend config already supports your required setup:

- [api.js](C:\Users\User\Documents\Codex\2026-04-19-files-mentioned-by-the-user-barber\barber-booking-app\frontend\src\config\api.js)
- [vite.config.js](C:\Users\User\Documents\Codex\2026-04-19-files-mentioned-by-the-user-barber\barber-booking-app\frontend\vite.config.js)
- [server.js](C:\Users\User\Documents\Codex\2026-04-19-files-mentioned-by-the-user-barber\barber-booking-app\backend\src\server.js)

Production behavior:

- `VITE_API_URL=` blank means frontend fetches `/api/...` on the same domain
- Socket.IO connects on the same origin using `/socket.io`
- backend listens only on `127.0.0.1:5000`
- Nginx exposes the public HTTPS endpoints

## Verification Commands

Run these on the VPS after deployment:

```bash
curl -I http://lineupbarberbooking.org
curl http://lineupbarberbooking.org/api/health
curl -I https://lineupbarberbooking.org
curl https://lineupbarberbooking.org/api/health
pm2 status
pm2 logs lineup-backend --lines 50
sudo nginx -t
sudo certbot certificates
```

Browser checks:

1. Open `https://lineupbarberbooking.org`
2. Open browser DevTools
3. Confirm frontend requests hit `/api/...` on the same origin
4. Refresh a non-root React route and confirm it still works
5. Confirm Socket.IO connects successfully
6. Log in and confirm authenticated API requests still work

## Update Workflow

When you push a new version:

```bash
cd /var/www/lineupbarberbooking.org/current
git pull
npm install
npm --prefix backend install
npm --prefix frontend install
npm run frontend:build
pm2 restart lineup-backend
```

## Required Values You Still Need To Supply

You still need real production values for:

1. `JWT_SECRET`
2. PostgreSQL database credentials
3. mobile money provider credentials if using live payments
4. Pesapal credentials if using live payments
5. email and push notification credentials if those features are going live

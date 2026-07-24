# Backend Production Install

Queless production backend installs must be backend-only. Do not run a root
repository install as part of backend deployment.

## Safe Sequence

Run commands from the backend directory:

```bash
cd /var/www/barberbookingapp/backend
```

Back up the current backend package files and PM2 state before changing files:

```bash
TS="$(date -u +%Y%m%d%H%M%S)"
BACKUP="/var/www/queless.org/backups/backend-$TS"
mkdir -p "$BACKUP"
cp package.json "$BACKUP/package.json.before"
cp package-lock.json "$BACKUP/package-lock.json.before"
npm ls --omit=dev --json > "$BACKUP/npm-ls-before.json" || true
npm audit --omit=dev --json > "$BACKUP/npm-audit-before.json" || true
pm2 describe queless-backend > "$BACKUP/pm2-describe-before.txt"
pm2 list --no-color > "$BACKUP/pm2-list-before.txt"
```

Install production dependencies deterministically:

```bash
npm ci --omit=dev
```

Production uses PostgreSQL. `sqlite3` is intentionally a development dependency
for local SQLite mode and import tooling, so a production install must not
contain `sqlite3` or the repository root package link.

Run the preflight before replacing or restarting the live process:

```bash
NODE_ENV=production DB_CLIENT=postgres npm run preflight:production
```

The preflight verifies:

- it is running from `backend/`
- Node and npm versions are visible
- glibc is detected on Linux
- production env file exists without printing values
- package lock consistency
- production dependency audit
- the production dependency tree does not include `queless -> file:..`
- the production dependency tree does not include `sqlite3` for PostgreSQL mode
- PostgreSQL runtime imports and startup smoke work

Restart only after install and preflight pass:

```bash
pm2 restart queless-backend --update-env
pm2 save
```

Verify:

```bash
npm audit --omit=dev
npm ls --omit=dev
curl -fsS https://queless.org/api/health
curl -fsS https://queless.org/api/health/ready
```

## Rollback

If install, preflight, startup, or health checks fail, restore the backed-up
package files and reinstall the previous dependency state:

```bash
cd /var/www/barberbookingapp/backend
cp "$BACKUP/package.json.before" package.json
cp "$BACKUP/package-lock.json.before" package-lock.json
npm ci --omit=dev
pm2 restart queless-backend --update-env
pm2 save
curl -fsS https://queless.org/api/health
curl -fsS https://queless.org/api/health/ready
```

Do not run `npm audit fix --force` on production.

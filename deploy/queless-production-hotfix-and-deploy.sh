#!/usr/bin/env bash
set -Eeuo pipefail

# Deprecated one-off Queless production hotfix runner.
#
# Do not use this as the normal Queless deploy path. It was written for a
# historical customer-subscription hotfix and its old defaults can restore the
# previous non-services-only root website. Keep it blocked unless someone is
# intentionally replaying that legacy hotfix with a separate reviewed plan.

WEBSITE_SRC="${WEBSITE_SRC:-/var/www/queless.org/current/line-up-barber-website}"
WEBSITE_DIST="${WEBSITE_DIST:-$WEBSITE_SRC/dist}"
APP_REPO="${APP_REPO:-/var/www/barberbookingapp}"
APP_SRC="${APP_SRC:-$APP_REPO/frontend}"
APP_DIST="${APP_DIST:-$APP_SRC/dist}"
BACKEND_SRC="${BACKEND_SRC:-$APP_REPO/backend}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/www/queless.org/backups}"
PM2_PROCESS="${PM2_PROCESS:-queless-backend}"
TS="${TS:-$(date +%Y%m%d-%H%M%S)}"

if [[ "${ALLOW_DEPRECATED_HOTFIX_DEPLOY:-}" != "true" ]]; then
  printf '%s\n' \
    "This deprecated hotfix deploy script is intentionally blocked." \
    "Use the reviewed Queless release procedure instead, keeping / as the services-only public website and /app/ as the application." \
    "Set ALLOW_DEPRECATED_HOTFIX_DEPLOY=true only for the original legacy hotfix after explicit review."
  exit 2
fi

log() {
  printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"
}

fail() {
  printf '\nFAILED: %s\n' "$*" >&2
  exit 1
}

run() {
  log "RUN: $*"
  "$@"
}

require_path() {
  local path="$1"
  [[ -e "$path" ]] || fail "Required path not found: $path"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

show_git_status() {
  local path="$1"
  if git -C "$path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log "Git repo: $path"
    git -C "$path" status --short
  else
    log "Copied folder, not a git repo: $path"
  fi
}

apply_customer_subscription_hotfix() {
  log "Applying guarded customer subscription timestamp hotfix"
  python3 - "$BACKEND_SRC" "$APP_SRC" <<'PY'
from pathlib import Path
import sys

backend = Path(sys.argv[1])
app = Path(sys.argv[2])

service_path = backend / "src/services/customerSubscriptionService.js"
controller_path = backend / "src/controllers/customerSubscriptionController.js"
frontend_path = app / "src/App.jsx"

for path in (service_path, controller_path, frontend_path):
    if not path.exists():
        raise SystemExit(f"Missing file: {path}")

service = service_path.read_text(encoding="utf-8")
if "getFutureDateSqlPredicate" not in service:
    marker = 'const TRIAL_PAYMENT_STATUSES = new Set(["", "trial", "trialing", "free_trial"]);\n'
    insert = '''const TRIAL_PAYMENT_STATUSES = new Set(["", "trial", "trialing", "free_trial"]);
const POSTGRES_TIMESTAMP_TEXT_PATTERN =
  "^\\\\s*\\\\d{4}-\\\\d{2}-\\\\d{2}([ T]\\\\d{2}:\\\\d{2}(:\\\\d{2}(\\\\.\\\\d{1,6})?)?([+-]\\\\d{2}:?\\\\d{2}|Z)?)?\\\\s*$";

export function getFutureDateSqlPredicate(columnName) {
  if (env.dbClient === "postgres") {
    const trimmedColumn = `TRIM(CAST(${columnName} AS TEXT))`;
    return `(
       NULLIF(${trimmedColumn}, '') IS NOT NULL
       AND ${trimmedColumn} ~ '${POSTGRES_TIMESTAMP_TEXT_PATTERN}'
       AND NULLIF(${trimmedColumn}, '')::timestamptz > CURRENT_TIMESTAMP
     )`;
  }

  return `(${columnName} IS NOT NULL AND ${columnName} > CURRENT_TIMESTAMP)`;
}
'''
    if marker not in service:
        raise SystemExit("Could not find insertion point in customerSubscriptionService.js")
    service = service.replace(marker, insert, 1)

if 'const subscriptionStillPendingPredicate = getFutureDateSqlPredicate("cs.expires_at");' not in service:
    pending_function_setup = '''export async function getPendingCustomerPremiumPayment(userId, client = null) {
  if (!client?.get) {
    const query = await import("../db/query.js");
    client = { get: query.get };
  }
'''
    if pending_function_setup not in service:
        raise SystemExit("Could not find pending payment query in customerSubscriptionService.js")
    service = service.replace(
        pending_function_setup,
        pending_function_setup + '  const subscriptionStillPendingPredicate = getFutureDateSqlPredicate("cs.expires_at");\n',
        1,
    )
service = service.replace(
    """       AND cs.expires_at IS NOT NULL
       AND cs.expires_at > CURRENT_TIMESTAMP""",
    """       AND ${subscriptionStillPendingPredicate}""",
)
service_path.write_text(service, encoding="utf-8")

controller = controller_path.read_text(encoding="utf-8")
if "getFutureDateSqlPredicate" not in controller.split('} from "../services/customerSubscriptionService.js";', 1)[0]:
    controller = controller.replace(
        "  getCustomerSubscriptionEndDate,\n",
        "  getCustomerSubscriptionEndDate,\n  getFutureDateSqlPredicate,\n",
        1,
    )
controller = controller.replace(
    """           AND expires_at IS NOT NULL
           AND expires_at > CURRENT_TIMESTAMP`,""",
    """           AND ${getFutureDateSqlPredicate("expires_at")}`,""",
)
controller_path.write_text(controller, encoding="utf-8")

frontend = frontend_path.read_text(encoding="utf-8")
if 'setCustomerSubscriptionMessage("Premium status is temporarily unavailable.' not in frontend:
    frontend = frontend.replace(
        """      setCustomerSubscriptionState(DEFAULT_CUSTOMER_SUBSCRIPTION_STATE);
      setCustomerSubscriptionPlan(null);
      return;
    }""",
        """      setCustomerSubscriptionState(DEFAULT_CUSTOMER_SUBSCRIPTION_STATE);
      setCustomerSubscriptionPlan(null);
      setCustomerSubscriptionMessage("");
      return;
    }""",
        1,
    )
    frontend = frontend.replace(
        "      setPendingCustomerSubscriptionPayment(data?.pendingPayment?.reference ? data.pendingPayment : null);\n",
        "      setPendingCustomerSubscriptionPayment(data?.pendingPayment?.reference ? data.pendingPayment : null);\n      setCustomerSubscriptionMessage(\"\");\n",
        1,
    )
    frontend = frontend.replace(
        """    } catch {
      setCustomerSubscriptionState(DEFAULT_CUSTOMER_SUBSCRIPTION_STATE);
      setPendingCustomerSubscriptionPayment(null);
    } finally {""",
        """    } catch {
      setCustomerSubscriptionState(DEFAULT_CUSTOMER_SUBSCRIPTION_STATE);
      setPendingCustomerSubscriptionPayment(null);
      setCustomerSubscriptionMessage("Premium status is temporarily unavailable. You can still use the app while we reconnect.");
    } finally {""",
        1,
    )
frontend_path.write_text(frontend, encoding="utf-8")
PY
}

log "Queless production deploy starting, timestamp: $TS"

require_command node
require_command npm
require_command python3
require_command pm2
require_command nginx
require_command systemctl
require_command curl

require_path "$WEBSITE_SRC"
require_path "$WEBSITE_DIST"
require_path "$APP_REPO"
require_path "$APP_SRC"
require_path "$APP_DIST"
require_path "$BACKEND_SRC"
require_path "$WEBSITE_SRC/package.json"
require_path "$APP_SRC/package.json"
require_path "$BACKEND_SRC/package.json"
require_path "$BACKEND_SRC/src/services/customerSubscriptionService.js"
require_path "$BACKEND_SRC/src/controllers/customerSubscriptionController.js"
require_path "$APP_SRC/src/App.jsx"

log "Git/copy folder status"
show_git_status "$WEBSITE_SRC"
show_git_status "$APP_REPO"
show_git_status "$APP_SRC"
show_git_status "$BACKEND_SRC"

log "Creating backups"
run mkdir -p "$BACKUP_ROOT"
run cp -a "$WEBSITE_DIST" "$BACKUP_ROOT/website-dist-$TS"
run cp -a "$APP_DIST" "$BACKUP_ROOT/app-dist-$TS"
run mkdir -p "$BACKUP_ROOT/backend-files-$TS/src/services" "$BACKUP_ROOT/backend-files-$TS/src/controllers" "$BACKUP_ROOT/backend-files-$TS/frontend-src"
run cp -a "$BACKEND_SRC/src/services/customerSubscriptionService.js" "$BACKUP_ROOT/backend-files-$TS/src/services/customerSubscriptionService.js"
run cp -a "$BACKEND_SRC/src/controllers/customerSubscriptionController.js" "$BACKUP_ROOT/backend-files-$TS/src/controllers/customerSubscriptionController.js"
run cp -a "$APP_SRC/src/App.jsx" "$BACKUP_ROOT/backend-files-$TS/frontend-src/App.jsx"

apply_customer_subscription_hotfix

log "Confirming hotfix markers"
grep -q "getFutureDateSqlPredicate" "$BACKEND_SRC/src/services/customerSubscriptionService.js" || fail "Backend hotfix marker missing"
grep -q "subscriptionStillPendingPredicate" "$BACKEND_SRC/src/services/customerSubscriptionService.js" || fail "Pending payment predicate marker missing"
grep -q "Premium status is temporarily unavailable" "$APP_SRC/src/App.jsx" || fail "Frontend fallback marker missing"

log "Backend syntax and tests"
run bash -lc "cd '$BACKEND_SRC' && npm run check"
run bash -lc "cd '$BACKEND_SRC' && npm test"

log "Building website"
run bash -lc "cd '$WEBSITE_SRC' && QUELESS_APP_DIR='$APP_REPO' npm install"
run bash -lc "cd '$WEBSITE_SRC' && QUELESS_APP_DIR='$APP_REPO' npm run build"

log "Building app with /app/ base path"
run bash -lc "cd '$APP_SRC' && npm install"
run bash -lc "cd '$APP_SRC' && VITE_BASE_PATH='/app/' npm run build"
grep -q '"/app/' "$APP_SRC/dist/index.html" || fail "App dist index.html does not appear to reference /app/ assets"

log "Restart backend"
run pm2 restart "$PM2_PROCESS" --update-env
run pm2 status

log "Reload Nginx"
run nginx -t
run systemctl reload nginx

log "Verify live endpoints"
run curl -I --fail --silent --show-error https://queless.org/
run curl -I --fail --silent --show-error https://queless.org/app/
run curl --fail --silent --show-error https://queless.org/api/health

log "Checking recent backend logs for customer subscription timestamp crash"
if pm2 logs "$PM2_PROCESS" --lines 120 --nostream | grep -E "operator does not exist: text > timestamp|customer-subscriptions/me.*statusCode.?500|statusCode.?500.*customer-subscriptions/me" >/tmp/queless-deploy-log-check-"$TS".txt; then
  cat /tmp/queless-deploy-log-check-"$TS".txt
  fail "Recent backend logs still contain the customer subscription timestamp crash"
fi

log "Deployment complete"
printf '\nBackup timestamp: %s\n' "$TS"
printf 'Website backup: %s\n' "$BACKUP_ROOT/website-dist-$TS"
printf 'App backup: %s\n' "$BACKUP_ROOT/app-dist-$TS"
printf 'Backend file backup: %s\n' "$BACKUP_ROOT/backend-files-$TS"

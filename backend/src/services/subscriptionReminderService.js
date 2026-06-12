/**
 * Subscription expiry reminder service.
 *
 * Sends in-app (and FCM) notifications to users whose subscriptions are
 * approaching expiry. Tracks sent reminders in subscription_reminder_events
 * so each milestone fires exactly once per subscription period.
 *
 * Milestones: 7d → 3d → 1d → expired
 *
 * Designed to be called from a cron/scheduled job.
 */

import { all, run, get } from "../db/query.js";
import { logger } from "../config/logger.js";
import { createInAppNotification, sendNotificationToUser } from "./notificationService.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MILESTONES = [
  { key: "reminder_7d", daysAhead: 7 },
  { key: "reminder_3d", daysAhead: 3 },
  { key: "reminder_1d", daysAhead: 1 },
  { key: "expiry_notice", daysAhead: 0 },
];

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function planLabel(scope, tier) {
  if (scope === "customer") return "Premium Customer";
  const t = String(tier || "").toUpperCase();
  if (t === "PLATINUM") return "Platinum Provider";
  if (t === "PREMIUM") return "Premium Provider";
  return "Provider";
}

function buildMessage(eventType, label, expiresAt) {
  const date = expiresAt ? new Date(expiresAt).toLocaleDateString("en-UG") : "";
  if (eventType === "expiry_notice") {
    return {
      title: `${label} plan expired`,
      body: `Your ${label} plan has expired. Renew to restore your premium features.`,
    };
  }
  const daysMap = { reminder_7d: 7, reminder_3d: 3, reminder_1d: 1 };
  const days = daysMap[eventType] || 1;
  const dayWord = days === 1 ? "tomorrow" : `in ${days} days`;
  return {
    title: `${label} renews ${dayWord}`,
    body: days === 1
      ? `Your ${label} plan expires ${dayWord} (${date}). Renew to keep your benefits.`
      : `Your ${label} plan expires in ${days} days (${date}). Renew to keep your benefits.`,
  };
}

async function hasReminderBeenSent(userId, scope, eventType, expirySnapshot) {
  const row = await get(
    `SELECT id FROM subscription_reminder_events
     WHERE user_id = ?
       AND account_scope = ?
       AND event_type = ?
       AND expiry_snapshot = ?
     LIMIT 1`,
    [userId, scope, eventType, expirySnapshot]
  ).catch(() => null);
  return Boolean(row);
}

async function markReminderSent(userId, scope, subscriptionId, eventType, expirySnapshot, metadata = {}) {
  await run(
    `INSERT INTO subscription_reminder_events
       (user_id, account_scope, subscription_id, event_type, expiry_snapshot, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, scope, subscriptionId, eventType, expirySnapshot, JSON.stringify(metadata)]
  ).catch((error) => logger.warn({ err: error }, "Failed to record reminder event"));
}

async function sendReminder(userId, scope, subscriptionId, tier, eventType, expiresAt) {
  const expirySnapshot = expiresAt ? new Date(expiresAt).toISOString().slice(0, 10) : "expired";
  const alreadySent = await hasReminderBeenSent(userId, scope, eventType, expirySnapshot);
  if (alreadySent) return false;

  const label = planLabel(scope, tier);
  const { title, body } = buildMessage(eventType, label, expiresAt);
  const route = "/profile";

  await createInAppNotification(userId, {
    title,
    body,
    type: "subscription",
    data: { route, scope, tier, eventType, expiresAt },
  }).catch((error) => logger.warn({ err: error }, "createInAppNotification failed for reminder"));

  await sendNotificationToUser(userId, title, body, { route, scope, tier }).catch(() => {});

  await markReminderSent(userId, scope, subscriptionId, eventType, expirySnapshot, {
    label,
    tier,
    expiresAt,
  });

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider subscription reminders
// ─────────────────────────────────────────────────────────────────────────────

async function processProviderReminders() {
  const now = new Date();
  let sent = 0;

  // Find all active/recently-expired provider subscriptions
  const subs = await all(
    `SELECT bs.id, bs.tier, bs.status, bs.expires_at, b.owner_user_id AS user_id
     FROM barber_subscriptions bs
     JOIN barbers b ON b.id = bs.barber_id
     WHERE LOWER(bs.status) IN ('active', 'trialing', 'expired')
       AND bs.expires_at IS NOT NULL
       AND bs.tier IN ('PREMIUM', 'PLATINUM')
       AND bs.expires_at > datetime('now', '-2 days')
       AND bs.expires_at < datetime('now', '+8 days')`,
    []
  ).catch(() => []);

  for (const sub of subs) {
    const expiry = new Date(sub.expires_at);
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);

    for (const milestone of MILESTONES) {
      const shouldFire =
        milestone.daysAhead === 0
          ? daysLeft <= 0 && daysLeft >= -1
          : daysLeft > 0 && daysLeft <= milestone.daysAhead + 0.5;

      if (!shouldFire) continue;

      const fired = await sendReminder(
        sub.user_id,
        "provider",
        sub.id,
        sub.tier,
        milestone.key,
        sub.expires_at
      );
      if (fired) sent++;
      break; // send only the most urgent milestone per subscription per run
    }
  }
  return sent;
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer subscription reminders
// ─────────────────────────────────────────────────────────────────────────────

async function processCustomerReminders() {
  const now = new Date();
  let sent = 0;

  const subs = await all(
    `SELECT id, user_id, tier, status, expires_at
     FROM customer_subscriptions
     WHERE UPPER(tier) = 'PREMIUM'
       AND LOWER(status) IN ('active', 'expired')
       AND expires_at IS NOT NULL
       AND expires_at > datetime('now', '-2 days')
       AND expires_at < datetime('now', '+8 days')`,
    []
  ).catch(() => []);

  for (const sub of subs) {
    const expiry = new Date(sub.expires_at);
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / 86400000);

    for (const milestone of MILESTONES) {
      const shouldFire =
        milestone.daysAhead === 0
          ? daysLeft <= 0 && daysLeft >= -1
          : daysLeft > 0 && daysLeft <= milestone.daysAhead + 0.5;

      if (!shouldFire) continue;

      const fired = await sendReminder(
        sub.user_id,
        "customer",
        sub.id,
        "PREMIUM",
        milestone.key,
        sub.expires_at
      );
      if (fired) sent++;
      break;
    }
  }
  return sent;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main job entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function runExpiryReminderJob() {
  const startedAt = new Date();
  let jobId;

  try {
    const result = await run(
      `INSERT INTO subscription_job_runs (job_name, started_at, status)
       VALUES ('expiry_reminders', ?, 'running')`,
      [startedAt.toISOString()]
    ).catch(() => null);
    jobId = result?.lastID;
  } catch {
    // table may not exist yet in SQLite dev — non-fatal
  }

  let totalSent = 0;
  let errorMessage = null;

  try {
    const [p, c] = await Promise.all([
      processProviderReminders(),
      processCustomerReminders(),
    ]);
    totalSent = p + c;
    logger.info({ totalSent, providerSent: p, customerSent: c }, "Expiry reminder job complete");
  } catch (error) {
    errorMessage = error?.message || "Unknown error";
    logger.error({ err: error }, "Expiry reminder job failed");
  }

  if (jobId) {
    await run(
      `UPDATE subscription_job_runs
       SET finished_at = ?, status = ?, records_processed = ?, error_message = ?
       WHERE id = ?`,
      [
        new Date().toISOString(),
        errorMessage ? "failed" : "completed",
        totalSent,
        errorMessage,
        jobId,
      ]
    ).catch(() => {});
  }

  return { totalSent, error: errorMessage };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending payment reconciliation check
// ─────────────────────────────────────────────────────────────────────────────

export async function runPendingPaymentCheck() {
  // Find provider subscription payments stuck in pending for > 30 min
  const stale = await all(
    `SELECT pt.id, pt.user_id, pt.internal_reference, pt.provider, bs.tier
     FROM payment_transactions pt
     JOIN barber_subscriptions bs ON bs.id = pt.subscription_id
     WHERE LOWER(pt.status) IN ('pending', 'initiated', 'processing')
       AND LOWER(bs.status) = 'pending'
       AND pt.created_at < datetime('now', '-30 minutes')
       AND pt.created_at > datetime('now', '-24 hours')`,
    []
  ).catch(() => []);

  for (const payment of stale) {
    await createInAppNotification(payment.user_id, {
      title: "Payment pending",
      body: `Your ${planLabel("provider", payment.tier)} payment (ref: ${payment.internal_reference}) is still pending. Tap to check status.`,
      type: "payment",
      data: { route: "/profile", reference: payment.internal_reference },
    }).catch(() => {});
  }

  // Same for customer subscriptions
  const staleCustomer = await all(
    `SELECT pt.user_id, pt.internal_reference, pt.provider
     FROM payment_transactions pt
     JOIN customer_subscriptions cs ON cs.id = pt.customer_subscription_id
     WHERE LOWER(pt.status) IN ('pending', 'initiated', 'processing')
       AND LOWER(cs.status) = 'pending'
       AND pt.created_at < datetime('now', '-30 minutes')
       AND pt.created_at > datetime('now', '-24 hours')`,
    []
  ).catch(() => []);

  for (const payment of staleCustomer) {
    await createInAppNotification(payment.user_id, {
      title: "Payment pending",
      body: `Your Premium Customer payment is still pending. Tap to verify status.`,
      type: "payment",
      data: { route: "/profile", reference: payment.internal_reference },
    }).catch(() => {});
  }
}

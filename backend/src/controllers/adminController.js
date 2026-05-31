import { all, get, run, transaction } from "../db/query.js";
import { getCustomerPremiumPlan, getCustomerPremiumPrice, getCustomerSubscriptionEndDate, isActiveCustomerPremium, mapCustomerSubscription } from "../services/customerSubscriptionService.js";
import { getDeploymentReadiness, softDisableDemoBusinesses } from "../services/deploymentReadiness.js";
import { FREE_TRIAL_DAYS, getPlanPrice, getSubscriptionEndDate, getSubscriptionTierConfig, normalizeBillingCycle } from "../services/paymentService.js";
import { getProviderPublicationReadiness } from "../services/providerPublicationReadiness.js";
import { getLatestProviderSubscription, isActiveProviderPlatinum } from "../services/providerSubscriptionAccess.js";
import { env } from "../config/env.js";

const PLAN_CODES = ["PLUS", "PREMIUM", "PLATINUM"];
const CUSTOMER_STATUSES = new Set(["active", "inactive", "expired", "cancelled", "pending"]);
const PROVIDER_STATUSES = new Set(["active", "inactive", "expired", "cancelled", "pending", "trialing"]);
const SUPPORT_REQUEST_STATUSES = new Set(["open", "in_progress", "waiting_on_customer", "resolved", "closed"]);

function addDays(days, base = new Date()) {
  const value = new Date(base);
  value.setDate(value.getDate() + Number(days || 0));
  return value.toISOString();
}

function getTrialMeta(createdAt) {
  const started = createdAt ? new Date(createdAt) : new Date();
  const trialEndsAt = addDays(FREE_TRIAL_DAYS, started);
  const left = Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  return {
    trial_ends_at: trialEndsAt,
    trial_days_left: left,
    trial_status: left > 0 ? "trial" : "expired",
  };
}

function normalizePlan(row = {}) {
  const latestTier = String(row.latest_subscription_tier || "").toUpperCase();
  const latestStatus = String(row.latest_subscription_status || "").toLowerCase();
  const fallbackTier = String(row.subscription_tier || "").toUpperCase();
  const fallbackStatus = String(row.subscription_status || "").toLowerCase();
  const trial = getTrialMeta(row.created_at);
  const hasPaidPlan = PLAN_CODES.includes(latestTier) && latestStatus === "active";
  const fallbackPaid = PLAN_CODES.includes(fallbackTier) && fallbackStatus === "active";

  if (hasPaidPlan) return { current_plan: latestTier, payment_status: latestStatus, ...trial };
  if (fallbackPaid) return { current_plan: fallbackTier, payment_status: fallbackStatus, ...trial };
  if (trial.trial_status === "trial") return { current_plan: "TRIAL", payment_status: "trial", ...trial };
  return { current_plan: "UNPAID", payment_status: "restricted", ...trial };
}

function mapBusiness(row = {}) {
  const plan = normalizePlan(row);
  return {
    id: row.id,
    business_name: row.business_name,
    business_type: row.business_type || "barber",
    owner_name: row.owner_name || row.owner_username || "Owner",
    owner_username: row.owner_username,
    phone: row.phone || "",
    email: row.email || "",
    location: row.location || "",
    current_plan: plan.current_plan,
    payment_status: plan.payment_status,
    trial_status: plan.trial_status,
    trial_days_left: plan.trial_days_left,
    trial_ends_at: plan.trial_ends_at,
    plan_start_date: row.latest_subscription_started_at || row.created_at,
    renewal_date: row.latest_subscription_expires_at || row.subscription_expires_at || null,
    verification_status: row.verified_status || "New",
    verification_document_name: row.verification_document_name || "",
    verification_document_url: row.verification_document_url || "",
    verification_notes: row.verification_notes || "",
    verification_submitted_at: row.verification_submitted_at || null,
    verification_reviewed_at: row.verification_reviewed_at || null,
    verification_reviewed_by: row.verification_reviewed_by || null,
    active_status: ["suspended", "inactive"].includes(String(row.subscription_status || "").toLowerCase())
      ? row.subscription_status
      : "active",
    service_count: Number(row.service_count || 0),
    booking_count: Number(row.booking_count || 0),
    review_count: Number(row.review_count || 0),
    average_rating: Number(row.average_rating || 0),
    last_active_at: row.last_active_at || row.created_at,
    image: row.image || "",
    portfolio: row.portfolio_json || "[]",
    accepts_wallet: Number(row.accepts_wallet || 0),
    accepts_cash: Number(row.accepts_cash || 0),
    created_at: row.created_at,
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function asJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function cleanAdminSupportText(value, maxLength = 2000) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function isFailed(value) {
  return ["failed", "cancelled", "expired", "error"].includes(String(value || "").toLowerCase());
}

function isPending(value) {
  return ["pending", "processing", "initiated"].includes(String(value || "").toLowerCase());
}

function isSuccess(value) {
  return ["successful", "success", "completed", "paid"].includes(String(value || "").toLowerCase());
}

function getFeatureRules() {
  return [
    { key: "browse_services", label: "Search/browse services", freeCustomer: true, premiumCustomer: true, proProvider: false, premiumProvider: false, platinumProvider: false },
    { key: "book_service", label: "Book service", freeCustomer: true, premiumCustomer: true, proProvider: false, premiumProvider: false, platinumProvider: false },
    { key: "smart_match", label: "Smart Match", freeCustomer: false, premiumCustomer: true, proProvider: false, premiumProvider: false, platinumProvider: false },
    { key: "customer_wallet_topup", label: "Customer wallet/top-up", freeCustomer: true, premiumCustomer: true, proProvider: false, premiumProvider: false, platinumProvider: false },
    { key: "checkout_payment", label: "Checkout/payment", freeCustomer: true, premiumCustomer: true, proProvider: true, premiumProvider: true, platinumProvider: true },
    { key: "provider_listing", label: "Provider listing", freeCustomer: false, premiumCustomer: false, proProvider: true, premiumProvider: true, platinumProvider: true },
    { key: "booking_management", label: "Booking management", freeCustomer: false, premiumCustomer: false, proProvider: true, premiumProvider: true, platinumProvider: true },
    { key: "business_wallet", label: "Business wallet/earnings", freeCustomer: false, premiumCustomer: false, proProvider: true, premiumProvider: true, platinumProvider: true },
    { key: "ai_coach", label: "AI Business Coach", freeCustomer: false, premiumCustomer: false, proProvider: false, premiumProvider: false, platinumProvider: true },
    { key: "subscription_upgrade", label: "Subscription upgrade", freeCustomer: true, premiumCustomer: true, proProvider: true, premiumProvider: true, platinumProvider: true },
    { key: "subscription_expiry_lock", label: "Subscription expiry lock", freeCustomer: false, premiumCustomer: true, proProvider: true, premiumProvider: true, platinumProvider: true },
    { key: "analytics", label: "Analytics", freeCustomer: false, premiumCustomer: false, proProvider: false, premiumProvider: true, platinumProvider: true },
    { key: "priority_placement", label: "Priority placement", freeCustomer: false, premiumCustomer: false, proProvider: false, premiumProvider: true, platinumProvider: true },
    { key: "premium_visibility", label: "Premium visibility", freeCustomer: false, premiumCustomer: false, proProvider: false, premiumProvider: true, platinumProvider: true },
    { key: "platinum_features", label: "Platinum features", freeCustomer: false, premiumCustomer: false, proProvider: false, premiumProvider: false, platinumProvider: true },
  ];
}

function getFeatureMeta(feature) {
  return getFeatureRules().find((item) => item.key === feature) || null;
}

async function logAdminAction(client, req, { actionType, targetType, targetId, oldValue, newValue, reason = "" }) {
  await client.run(
    `INSERT INTO admin_audit_log
     (admin_user_id, admin_username, action_type, target_type, target_id, old_value, new_value, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user?.id || null,
      req.user?.username || "",
      actionType,
      targetType,
      String(targetId),
      asJson(oldValue),
      asJson(newValue),
      String(reason || "").trim(),
    ]
  );
}

function addMonths(months, base = new Date()) {
  const value = new Date(base);
  value.setMonth(value.getMonth() + Number(months || 1));
  return value.toISOString();
}

function mapCustomerSubscriptionRow(row = {}) {
  const active = isActiveCustomerPremium(row.subscription_id ? {
    tier: row.customer_plan,
    status: row.subscription_status,
    payment_status: row.payment_status,
    expires_at: row.expires_at,
  } : null);
  return {
    userId: row.user_id,
    username: row.username,
    fullName: row.full_name || row.username,
    email: row.email || "",
    phone: row.phone || "",
    role: row.role,
    plan: active ? "PREMIUM" : "FREE",
    rawPlan: row.customer_plan || "FREE",
    status: row.subscription_status || "free",
    billingCycle: row.billing_cycle || "",
    startedAt: row.started_at || null,
    expiresAt: row.expires_at || null,
    smartMatchAccess: active,
    lastPaymentStatus: row.payment_status || "none",
    paymentReference: row.payment_reference || "",
    provider: row.provider || "",
    price: Number(row.price || 0),
    currency: row.currency || "UGX",
    lastLogin: row.last_login_at || "",
    subscriptionId: row.subscription_id || null,
    bookingCount: Number(row.booking_count || 0),
    walletBalance: Number(row.wallet_balance || 0),
  };
}

function mapProviderSubscriptionRow(row = {}) {
  const subscription = {
    tier: row.subscription_tier_latest || row.subscription_tier,
    status: row.subscription_status_latest || row.subscription_status,
    trial_status: row.trial_status,
    is_active: row.subscription_is_active,
    expires_at: row.expires_at || row.subscription_expires_at,
  };
  const aiCoachAccess = isActiveProviderPlatinum(row, subscription);
  return {
    businessId: row.business_id,
    userId: row.owner_user_id,
    providerName: row.full_name || row.username,
    businessName: row.business_name,
    email: row.email || "",
    phone: row.phone || "",
    plan: row.subscription_tier_latest || row.subscription_tier || "TRIAL",
    status: row.subscription_status_latest || row.subscription_status || "inactive",
    trialStatus: row.trial_status || "",
    startedAt: row.started_at || null,
    expiresAt: row.expires_at || row.subscription_expires_at || null,
    businessStatus: row.business_status || "draft",
    isPublished: Number(row.is_published || 0) === 1,
    aiCoachAccess,
    lastPaymentStatus: row.payment_status || "none",
    subscriptionId: row.subscription_id || null,
    bookingCount: Number(row.booking_count || 0),
    walletAvailable: Number(row.wallet_available || 0),
  };
}

async function getBusinessRows() {
  return all(
    `SELECT
       b.*,
       u.username AS owner_username,
       p.full_name AS owner_name,
       p.phone,
       p.email,
       (SELECT COUNT(*) FROM barber_services s WHERE s.barber_id = b.id) AS service_count,
       (SELECT COUNT(*) FROM bookings bk WHERE bk.barber_id = b.id) AS booking_count,
       (SELECT MAX(created_at) FROM bookings bk WHERE bk.barber_id = b.id) AS last_active_at,
       (SELECT COALESCE(AVG(r.rating), 0) FROM reviews r WHERE r.barber_id = b.id AND COALESCE(r.blocked_from_public, 0) = 0) AS average_rating,
       (SELECT COUNT(*) FROM reviews r WHERE r.barber_id = b.id AND COALESCE(r.blocked_from_public, 0) = 0) AS review_count,
       (SELECT tier FROM barber_subscriptions bs WHERE bs.barber_id = b.id ORDER BY id DESC LIMIT 1) AS latest_subscription_tier,
       (SELECT status FROM barber_subscriptions bs WHERE bs.barber_id = b.id ORDER BY id DESC LIMIT 1) AS latest_subscription_status,
       (SELECT payment_status FROM barber_subscriptions bs WHERE bs.barber_id = b.id ORDER BY id DESC LIMIT 1) AS latest_subscription_payment_status,
       (SELECT trial_status FROM barber_subscriptions bs WHERE bs.barber_id = b.id ORDER BY id DESC LIMIT 1) AS latest_subscription_trial_status,
       (SELECT started_at FROM barber_subscriptions bs WHERE bs.barber_id = b.id ORDER BY id DESC LIMIT 1) AS latest_subscription_started_at,
       (SELECT expires_at FROM barber_subscriptions bs WHERE bs.barber_id = b.id ORDER BY id DESC LIMIT 1) AS latest_subscription_expires_at
     FROM barbers b
     JOIN users u ON u.id = b.owner_user_id
     LEFT JOIN profiles p ON p.user_id = u.id
     ORDER BY b.id DESC`
  );
}

async function getBookings() {
  return all(
    `SELECT
       bk.*,
       b.business_name,
       b.business_type,
       u.username AS customer_username,
       p.full_name AS customer_name
     FROM bookings bk
     LEFT JOIN barbers b ON b.id = bk.barber_id
     LEFT JOIN users u ON u.id = bk.customer_user_id
     LEFT JOIN profiles p ON p.user_id = u.id
     ORDER BY bk.created_at DESC, bk.id DESC
     LIMIT 200`
  );
}

export async function getAdminOverview(req, res, next) {
  try {
    const [usersRow, businessesRows, bookingsRows, servicesRows] = await Promise.all([
      get(`SELECT COUNT(*) AS count FROM users`),
      getBusinessRows(),
      getBookings(),
      all(
        `SELECT service_name, COUNT(*) AS bookings, COALESCE(SUM(price), 0) AS revenue
         FROM bookings
         GROUP BY service_name
         ORDER BY bookings DESC
         LIMIT 8`
      ),
    ]);

    const businesses = businessesRows.map(mapBusiness);
    const totalRevenue = bookingsRows
      .filter((booking) => booking.status === "completed")
      .reduce((sum, booking) => sum + Number(booking.price || 0), 0);

    const overview = {
      total_users: Number(usersRow?.count || 0),
      total_businesses: businesses.length,
      active_trials: businesses.filter((item) => item.current_plan === "TRIAL").length,
      plus_businesses: businesses.filter((item) => item.current_plan === "PLUS").length,
      premium_businesses: businesses.filter((item) => item.current_plan === "PREMIUM").length,
      platinum_businesses: businesses.filter((item) => item.current_plan === "PLATINUM").length,
      expired_trials: businesses.filter((item) => item.trial_status === "expired").length,
      unpaid_businesses: businesses.filter((item) => item.current_plan === "UNPAID").length,
      total_bookings: bookingsRows.length,
      total_revenue_estimate: totalRevenue,
    };

    res.json({
      success: true,
      overview,
      businesses,
      bookings: bookingsRows,
      services: servicesRows,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminSubscriptionSummary(req, res, next) {
  try {
    const [customerRows, providerRows, paymentRows] = await Promise.all([
      all(`SELECT u.id, u.role, cs.status, cs.tier, cs.payment_status, cs.expires_at
           FROM users u
           LEFT JOIN customer_subscriptions cs ON cs.id = (
             SELECT id FROM customer_subscriptions latest
             WHERE latest.user_id = u.id
             ORDER BY
               CASE
                 WHEN UPPER(tier) = 'PREMIUM'
                  AND LOWER(status) = 'active'
                  AND LOWER(payment_status) IN ('paid', 'successful')
                  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
                 THEN 0 ELSE 1
               END,
               COALESCE(activated_at, started_at, created_at) DESC,
               id DESC
             LIMIT 1
           )
           WHERE u.role = 'customer'`),
      all(`SELECT b.id, b.business_status, b.is_published, b.subscription_tier, b.subscription_status, bs.tier, bs.status, bs.trial_status, bs.payment_status, bs.expires_at, bs.is_active
           FROM barbers b
           LEFT JOIN barber_subscriptions bs ON bs.id = (
             SELECT id FROM barber_subscriptions latest
             WHERE latest.barber_id = b.id
             ORDER BY COALESCE(activated_at, started_at, created_at) DESC, id DESC
             LIMIT 1
           )
           WHERE b.deleted_at IS NULL`),
      all(`SELECT transaction_type, provider, status, COUNT(*) AS count
           FROM payment_transactions
           GROUP BY transaction_type, provider, status`),
    ]);

    const customerMapped = customerRows.map((row) => mapCustomerSubscriptionRow({
      user_id: row.id,
      role: row.role,
      customer_plan: row.tier,
      subscription_status: row.status,
      payment_status: row.payment_status,
      expires_at: row.expires_at,
      subscription_id: row.tier ? row.id : null,
    }));
    const providerMapped = providerRows.map((row) => mapProviderSubscriptionRow({
      business_id: row.id,
      business_status: row.business_status,
      is_published: row.is_published,
      subscription_tier: row.subscription_tier,
      subscription_status: row.subscription_status,
      subscription_tier_latest: row.tier,
      subscription_status_latest: row.status,
      subscription_is_active: row.is_active,
      trial_status: row.trial_status,
      payment_status: row.payment_status,
      expires_at: row.expires_at,
    }));

    res.json({
      success: true,
      summary: {
        totalFreeCustomers: customerMapped.filter((item) => item.plan === "FREE").length,
        totalPremiumCustomers: customerMapped.filter((item) => item.plan === "PREMIUM").length,
        totalPlusProviders: providerMapped.filter((item) => String(item.plan).toUpperCase() === "PLUS").length,
        totalPremiumProviders: providerMapped.filter((item) => String(item.plan).toUpperCase() === "PREMIUM").length,
        totalPlatinumProviders: providerMapped.filter((item) => String(item.plan).toUpperCase() === "PLATINUM").length,
        totalAiCoachProviders: providerMapped.filter((item) => item.aiCoachAccess).length,
        activeTrials: providerMapped.filter((item) => ["trial", "trialing", "active"].includes(String(item.trialStatus || "").toLowerCase()) && String(item.plan).toUpperCase() !== "PLATINUM").length,
        expiredTrials: providerMapped.filter((item) => String(item.trialStatus || "").toLowerCase() === "expired").length,
        failedPayments: paymentRows.filter((item) => String(item.status).toLowerCase() === "failed").reduce((sum, item) => sum + Number(item.count || 0), 0),
        pendingMtnPayments: paymentRows.filter((item) => String(item.provider).includes("mtn") && String(item.status).toLowerCase() === "pending").reduce((sum, item) => sum + Number(item.count || 0), 0),
        activeBusinesses: providerMapped.filter((item) => item.isPublished && ["active", "approved", "live"].includes(String(item.businessStatus).toLowerCase())).length,
        lockedBusinesses: providerMapped.filter((item) => !item.isPublished || ["locked", "inactive", "suspended"].includes(String(item.businessStatus).toLowerCase())).length,
      },
      paymentBreakdown: paymentRows,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminCustomerSubscriptions(req, res, next) {
  try {
    const rows = await all(
      `SELECT
         u.id AS user_id, u.username, u.role,
         p.full_name, p.email, p.phone,
         cs.id AS subscription_id, cs.tier AS customer_plan, cs.status AS subscription_status,
         cs.billing_cycle, cs.price, cs.currency, cs.provider,
         cs.started_at, cs.expires_at, cs.payment_status, cs.payment_reference,
         (SELECT COUNT(*) FROM bookings bk WHERE bk.customer_user_id = u.id) AS booking_count,
         (SELECT balance FROM wallets w WHERE w.user_id = u.id LIMIT 1) AS wallet_balance
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN customer_subscriptions cs ON cs.id = (
         SELECT id FROM customer_subscriptions latest
         WHERE latest.user_id = u.id
         ORDER BY
           CASE
             WHEN UPPER(tier) = 'PREMIUM'
              AND LOWER(status) = 'active'
              AND LOWER(payment_status) IN ('paid', 'successful')
              AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
             THEN 0 ELSE 1
           END,
           COALESCE(activated_at, started_at, created_at) DESC,
           id DESC
         LIMIT 1
       )
       WHERE u.role = 'customer'
       ORDER BY u.id DESC`
    );
    res.json({ success: true, customers: rows.map(mapCustomerSubscriptionRow), plan: getCustomerPremiumPlan() });
  } catch (error) {
    next(error);
  }
}

export async function getAdminProviderSubscriptions(req, res, next) {
  try {
    const rows = await all(
      `SELECT
         b.id AS business_id, b.owner_user_id, b.business_name, b.business_status, b.is_published,
         b.subscription_tier, b.subscription_status, b.subscription_expires_at,
         u.username, p.full_name, p.email, p.phone,
         bs.id AS subscription_id, bs.tier AS subscription_tier_latest, bs.status AS subscription_status_latest,
         bs.trial_status, bs.is_active AS subscription_is_active, bs.started_at, bs.expires_at, bs.payment_status,
         (SELECT COUNT(*) FROM bookings bk WHERE bk.barber_id = b.id) AS booking_count,
         (SELECT available_balance FROM barber_wallets bw WHERE bw.barber_id = b.id LIMIT 1) AS wallet_available
       FROM barbers b
       JOIN users u ON u.id = b.owner_user_id
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN barber_subscriptions bs ON bs.id = (
         SELECT id FROM barber_subscriptions latest
         WHERE latest.barber_id = b.id
         ORDER BY COALESCE(activated_at, started_at, created_at) DESC, id DESC
         LIMIT 1
       )
       WHERE b.deleted_at IS NULL
       ORDER BY b.id DESC`
    );
    res.json({ success: true, providers: rows.map(mapProviderSubscriptionRow) });
  } catch (error) {
    next(error);
  }
}

export async function updateAdminCustomerSubscription(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    const action = String(req.body.action || "").trim().toLowerCase();
    const status = String(req.body.status || "").trim().toLowerCase();
    const reason = String(req.body.reason || "").trim();
    if (!Number.isInteger(userId) || userId <= 0) throw httpError(400, "Valid customer user id is required.");

    const result = await transaction(async (client) => {
      const user = await client.get(`SELECT * FROM users WHERE id = ? AND role = 'customer'`, [userId]);
      if (!user) throw httpError(404, "Customer not found.");
      const before = await client.get(`SELECT * FROM customer_subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1`, [userId]);
      let nextStatus = status;
      let expiresAt = req.body.expiresAt || req.body.expires_at || addMonths(1);
      let nextSubscription = before;

      if (action === "upgrade" || action === "activate") {
        nextStatus = "active";
        expiresAt = req.body.expiresAt || req.body.expires_at || addMonths(Number(req.body.months || 1));
        const price = getCustomerPremiumPrice(req.body.billingCycle || "monthly");
        const reference = `admin-customer-premium-${userId}-${Date.now()}`;
        const insert = await client.run(
          `INSERT INTO customer_subscriptions
           (user_id, tier, price, status, billing_cycle, amount_paid, currency, payment_status, payment_reference, provider, expires_at, activated_at)
           VALUES (?, 'PREMIUM', ?, 'active', ?, ?, 'UGX', 'paid', ?, 'admin', ?, CURRENT_TIMESTAMP)`,
          [userId, price, normalizeBillingCycle(req.body.billingCycle || "monthly") || "monthly", price, reference, expiresAt]
        );
        nextSubscription = await client.get(`SELECT * FROM customer_subscriptions WHERE id = ?`, [insert.lastID]);
      } else if (action === "downgrade" || action === "deactivate" || action === "cancel") {
        nextStatus = action === "cancel" ? "cancelled" : "inactive";
        if (before) {
          await client.run(`UPDATE customer_subscriptions SET status = ?, payment_status = 'cancelled', expires_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [nextStatus, before.id]);
        }
        nextSubscription = await client.get(`SELECT * FROM customer_subscriptions WHERE id = ?`, [before?.id || 0]);
      } else if (action === "expire") {
        if (before) await client.run(`UPDATE customer_subscriptions SET status = 'expired', expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [addDays(-1), before.id]);
        nextSubscription = await client.get(`SELECT * FROM customer_subscriptions WHERE id = ?`, [before?.id || 0]);
      } else if (action === "set_status") {
        if (!CUSTOMER_STATUSES.has(nextStatus)) throw httpError(400, "Invalid customer subscription status.");
        if (!before) throw httpError(404, "Customer has no Premium subscription to update.");
        await client.run(`UPDATE customer_subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [nextStatus, before.id]);
        nextSubscription = await client.get(`SELECT * FROM customer_subscriptions WHERE id = ?`, [before.id]);
      } else {
        throw httpError(400, "Unsupported customer subscription action.");
      }

      await logAdminAction(client, req, {
        actionType: `customer_subscription_${action}`,
        targetType: "customer",
        targetId: userId,
        oldValue: before,
        newValue: nextSubscription,
        reason,
      });
      return nextSubscription;
    });

    res.json({ success: true, message: "Customer subscription updated.", subscription: mapCustomerSubscription(result) });
  } catch (error) {
    next(error);
  }
}

export async function updateAdminProviderSubscription(req, res, next) {
  try {
    const businessId = Number(req.params.businessId);
    const action = String(req.body.action || "").trim().toLowerCase();
    const reason = String(req.body.reason || "").trim();
    if (!Number.isInteger(businessId) || businessId <= 0) throw httpError(400, "Valid business id is required.");

    const result = await transaction(async (client) => {
      const business = await client.get(`SELECT * FROM barbers WHERE id = ? AND deleted_at IS NULL`, [businessId]);
      if (!business) throw httpError(404, "Business not found.");
      const before = await client.get(`SELECT * FROM barber_subscriptions WHERE barber_id = ? ORDER BY id DESC LIMIT 1`, [businessId]);
      let nextSubscription = before;

      if (action === "set_plan") {
        const plan = String(req.body.plan || "").trim().toUpperCase();
        if (!PLAN_CODES.includes(plan)) throw httpError(400, "Choose a provider plan to activate your business.");
        const billingCycle = normalizeBillingCycle(req.body.billingCycle || "monthly") || "monthly";
        const price = getPlanPrice(plan, billingCycle);
        const expiresAt = req.body.expiresAt || req.body.expires_at || getSubscriptionEndDate(new Date(), billingCycle);
        const planConfig = getSubscriptionTierConfig(plan);
        const insert = await client.run(
          `INSERT INTO barber_subscriptions
           (barber_id, tier, price, status, billing_cycle, amount_paid, currency, payment_status, payment_reference, provider, expires_at, activated_at, is_active)
           VALUES (?, ?, ?, 'active', ?, ?, 'UGX', 'paid', ?, 'admin', ?, CURRENT_TIMESTAMP, 1)`,
          [businessId, planConfig.code, price, billingCycle, price, `admin-provider-${businessId}-${Date.now()}`, expiresAt]
        );
        await client.run(
          `UPDATE barbers
           SET subscription_tier = ?, subscription_status = 'active', subscription_expires_at = ?, business_status = 'active', is_published = 1
           WHERE id = ?`,
          [planConfig.code, expiresAt, businessId]
        );
        nextSubscription = await client.get(`SELECT * FROM barber_subscriptions WHERE id = ?`, [insert.lastID]);
      } else if (action === "set_trial") {
        const expiresAt = req.body.expiresAt || req.body.expires_at || addDays(Number(req.body.days || FREE_TRIAL_DAYS));
        const insert = await client.run(
          `INSERT INTO barber_subscriptions
           (barber_id, tier, price, status, billing_cycle, amount_paid, currency, payment_status, trial_status, payment_reference, provider, expires_at, activated_at, is_active)
           VALUES (?, 'PLUS', 0, 'trialing', 'monthly', 0, 'UGX', 'trial', 'active', ?, 'admin', ?, CURRENT_TIMESTAMP, 1)`,
          [businessId, `admin-trial-${businessId}-${Date.now()}`, expiresAt]
        );
        await client.run(`UPDATE barbers SET subscription_tier = 'PLUS', subscription_status = 'trialing', subscription_expires_at = ?, business_status = 'active', is_published = 1 WHERE id = ?`, [expiresAt, businessId]);
        nextSubscription = await client.get(`SELECT * FROM barber_subscriptions WHERE id = ?`, [insert.lastID]);
      } else if (action === "deactivate" || action === "expire" || action === "cancel" || action === "set_status") {
        const nextStatus = action === "expire" ? "expired" : action === "cancel" ? "cancelled" : action === "deactivate" ? "inactive" : String(req.body.status || "").trim().toLowerCase();
        if (!PROVIDER_STATUSES.has(nextStatus)) throw httpError(400, "Invalid provider subscription status.");
        if (!before) throw httpError(404, "Provider has no subscription to update.");
        await client.run(
          `UPDATE barber_subscriptions
           SET status = ?, is_active = 0, expires_at = CASE WHEN ? = 'expired' THEN ? ELSE expires_at END, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [nextStatus, nextStatus, addDays(-1), before.id]
        );
        await client.run(
          `UPDATE barbers
           SET subscription_status = ?, subscription_expires_at = CASE WHEN ? = 'expired' THEN ? ELSE subscription_expires_at END
           WHERE id = ?`,
          [nextStatus, nextStatus, addDays(-1), businessId]
        );
        nextSubscription = await client.get(`SELECT * FROM barber_subscriptions WHERE id = ?`, [before.id]);
      } else if (action === "lock_business" || action === "unlock_business") {
        const unlock = action === "unlock_business";
        await client.run(`UPDATE barbers SET business_status = ?, is_published = ? WHERE id = ?`, [unlock ? "active" : "locked", unlock ? 1 : 0, businessId]);
        nextSubscription = await client.get(`SELECT * FROM barber_subscriptions WHERE id = ?`, [before?.id || 0]);
      } else {
        throw httpError(400, "Unsupported provider subscription action.");
      }

      await logAdminAction(client, req, {
        actionType: `provider_subscription_${action}`,
        targetType: "business",
        targetId: businessId,
        oldValue: before || business,
        newValue: nextSubscription,
        reason,
      });
      return { subscription: nextSubscription };
    });

    res.json({ success: true, message: "Provider subscription updated.", subscription: result.subscription });
  } catch (error) {
    next(error);
  }
}

export async function getAdminPayments(req, res, next) {
  try {
    const payments = await all(
      `SELECT
         pt.*,
         wt.wallet_credited,
         wt.credited_at,
         wt.mtn_reference,
         wt.last_status_checked_at,
         wt.error_message,
         u.username,
         p.full_name,
         b.business_name,
         bk.service_name AS booking_service
       FROM payment_transactions pt
       LEFT JOIN wallet_topups wt ON wt.reference = pt.internal_reference
       LEFT JOIN users u ON u.id = pt.user_id
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN barbers b ON b.id = pt.barber_id
       LEFT JOIN bookings bk ON bk.id = pt.booking_id
       ORDER BY pt.created_at DESC, pt.id DESC
       LIMIT 300`
    );
    res.json({ success: true, payments });
  } catch (error) {
    next(error);
  }
}

export async function getAdminPayment(req, res, next) {
  try {
    const paymentId = Number(req.params.paymentId);
    const payment = await get(`SELECT * FROM payment_transactions WHERE id = ?`, [paymentId]);
    if (!payment) throw httpError(404, "Payment not found.");
    res.json({ success: true, payment });
  } catch (error) {
    next(error);
  }
}

export async function runAdminAccessTest(req, res, next) {
  try {
    const feature = String(req.body.feature || "").trim();
    const userId = Number(req.body.userId || 0);
    const businessId = Number(req.body.businessId || 0);
    if (!feature) throw httpError(400, "Feature is required.");

    if (feature === "smart_match") {
      const user = await get(`SELECT * FROM users WHERE id = ?`, [userId]);
      if (!user) throw httpError(404, "Customer not found.");
      const subscription = await get(
        `SELECT * FROM customer_subscriptions
         WHERE user_id = ?
         ORDER BY
           CASE
             WHEN UPPER(tier) = 'PREMIUM'
              AND LOWER(status) = 'active'
              AND LOWER(payment_status) IN ('paid', 'successful')
              AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
             THEN 0 ELSE 1
           END,
           COALESCE(activated_at, started_at, created_at) DESC,
           id DESC
         LIMIT 1`,
        [userId]
      );
      const allowed = user.role === "customer" && isActiveCustomerPremium(subscription);
      return res.json({
        success: true,
        result: {
          selectedAccount: user.username,
          role: user.role,
          plan: allowed ? "Premium" : "Free",
          featureTested: "Customer Smart Match",
          expectedAccess: allowed ? "allowed" : "blocked",
          actualApiResult: allowed ? 200 : 403,
          status: "PASS",
        },
      });
    }

    if (feature === "ai_coach") {
      const business = await get(`SELECT * FROM barbers WHERE id = ?`, [businessId]);
      if (!business) throw httpError(404, "Business not found.");
      const subscription = await getLatestProviderSubscription(businessId);
      const allowed = isActiveProviderPlatinum(business, subscription);
      return res.json({
        success: true,
        result: {
          selectedBusiness: business.business_name,
          providerPlan: subscription?.tier || business.subscription_tier || "None",
          subscriptionStatus: subscription?.status || business.subscription_status || "inactive",
          featureTested: "Provider AI Business Coach",
          expectedAccess: allowed ? "allowed" : "blocked",
          actualApiResult: allowed ? 200 : 403,
          status: "PASS",
        },
      });
    }

    throw httpError(400, "Unsupported access test feature.");
  } catch (error) {
    next(error);
  }
}

export async function getAdminSummary(req, res, next) {
  try {
    const [users, businessesRows, bookingsRows, paymentsRows, subscriptionSummaryRows] = await Promise.all([
      all(`SELECT role, COUNT(*) AS count FROM users GROUP BY role`),
      getBusinessRows(),
      getBookings(),
      all(`SELECT * FROM payment_transactions ORDER BY created_at DESC, id DESC LIMIT 300`),
      all(`SELECT tier, status, payment_status FROM customer_subscriptions`),
    ]);

    const businesses = businessesRows.map(mapBusiness);
    const customerPremiumActive = subscriptionSummaryRows.filter((row) => isActiveCustomerPremium(row)).length;
    const providerCounts = businesses.reduce((acc, business) => {
      const plan = String(business.current_plan || "UNPAID").toUpperCase();
      acc[plan] = (acc[plan] || 0) + 1;
      return acc;
    }, {});
    const today = new Date().toDateString();
    const month = new Date().getMonth();
    const year = new Date().getFullYear();
    const successfulPayments = paymentsRows.filter((payment) => isSuccess(payment.status || payment.payment_status));
    const revenueToday = successfulPayments
      .filter((payment) => new Date(payment.created_at).toDateString() === today)
      .reduce((sum, payment) => sum + Number(payment.gross_amount || payment.amount || 0), 0);
    const revenueMonth = successfulPayments
      .filter((payment) => {
        const date = new Date(payment.created_at);
        return Number.isFinite(date.getTime()) && date.getMonth() === month && date.getFullYear() === year;
      })
      .reduce((sum, payment) => sum + Number(payment.gross_amount || payment.amount || 0), 0);

    res.json({
      success: true,
      summary: {
        totalCustomers: users.filter((row) => String(row.role).toLowerCase() === "customer").reduce((sum, row) => sum + Number(row.count || 0), 0),
        totalProviders: businesses.length,
        totalAdmins: users.filter((row) => String(row.role).toLowerCase().includes("admin")).reduce((sum, row) => sum + Number(row.count || 0), 0),
        activeSubscriptions: customerPremiumActive + businesses.filter((item) => ["PLUS", "PREMIUM", "PLATINUM"].includes(String(item.current_plan).toUpperCase()) && String(item.payment_status).toLowerCase() === "active").length,
        freeCustomers: Math.max(0, users.filter((row) => String(row.role).toLowerCase() === "customer").reduce((sum, row) => sum + Number(row.count || 0), 0) - customerPremiumActive),
        premiumCustomers: customerPremiumActive,
        plusProviders: providerCounts.PLUS || 0,
        premiumProviders: providerCounts.PREMIUM || 0,
        platinumProviders: providerCounts.PLATINUM || 0,
        pendingProviderApprovals: businesses.filter((item) => ["pending", "pending_subscription", "new"].includes(String(item.active_status || item.verification_status).toLowerCase())).length,
        failedPayments: paymentsRows.filter((payment) => isFailed(payment.status)).length,
        walletTopupIssues: paymentsRows.filter((payment) => String(payment.transaction_type || "").includes("wallet") && isFailed(payment.status)).length,
        bookingsToday: bookingsRows.filter((booking) => new Date(booking.created_at).toDateString() === today).length,
        revenueToday,
        revenueMonth,
        lockedFeatureAttempts: 0,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminUsers(req, res, next) {
  try {
    const rows = await all(
      `SELECT
         u.id, u.username, u.role, u.created_at,
         p.full_name, p.email, p.phone, p.subscription_status AS profile_subscription_status,
         w.balance AS wallet_balance,
         (SELECT COUNT(*) FROM bookings bk WHERE bk.customer_user_id = u.id) AS customer_booking_count,
         (SELECT COUNT(*) FROM barbers b WHERE b.owner_user_id = u.id AND b.deleted_at IS NULL) AS business_count,
         cs.tier AS customer_tier, cs.status AS customer_status, cs.payment_status AS customer_payment_status, cs.expires_at AS customer_expires_at
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN wallets w ON w.user_id = u.id
       LEFT JOIN customer_subscriptions cs ON cs.id = (
         SELECT id FROM customer_subscriptions latest
         WHERE latest.user_id = u.id
         ORDER BY COALESCE(activated_at, started_at, created_at) DESC, id DESC
         LIMIT 1
       )
       ORDER BY u.id DESC
       LIMIT 500`
    );

    res.json({
      success: true,
      users: rows.map((row) => {
        const subscription = row.customer_tier
          ? { tier: row.customer_tier, status: row.customer_status, payment_status: row.customer_payment_status, expires_at: row.customer_expires_at }
          : null;
        const premium = isActiveCustomerPremium(subscription);
        return {
          id: row.id,
          username: row.username,
          fullName: row.full_name || row.username,
          email: row.email || "",
          phone: row.phone || "",
          role: row.role,
          subscriptionTier: premium ? "PREMIUM" : String(row.customer_tier || (row.role === "customer" ? "FREE" : "NONE")).toUpperCase(),
          subscriptionStatus: row.customer_status || row.profile_subscription_status || (row.role === "customer" ? "free" : "none"),
          paymentStatus: row.customer_payment_status || "none",
          accountStatus: row.profile_subscription_status || row.customer_status || "active",
          smartMatchAccess: premium,
          aiCoachAccess: false,
          walletBalance: Number(row.wallet_balance || 0),
          bookingCount: Number(row.customer_booking_count || 0),
          businessCount: Number(row.business_count || 0),
          createdAt: row.created_at,
          lastLoginAt: null,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminBusinesses(req, res, next) {
  try {
    const rows = await getBusinessRows();
    res.json({
      success: true,
      businesses: rows.map((row) => {
        const mapped = mapBusiness(row);
        return {
          ...mapped,
          aiCoachAccess: isActiveProviderPlatinum(row, {
            tier: row.latest_subscription_tier || row.subscription_tier,
            status: row.latest_subscription_status || row.subscription_status,
            payment_status: row.latest_subscription_payment_status,
            trial_status: row.latest_subscription_trial_status,
            expires_at: row.latest_subscription_expires_at || row.subscription_expires_at,
          }),
          profileCompleteness: [
            mapped.business_name,
            mapped.business_type,
            mapped.location,
            mapped.phone,
            mapped.email,
            mapped.service_count > 0,
            mapped.image,
          ].filter(Boolean).length,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminBookings(req, res, next) {
  try {
    const bookings = await getBookings();
    res.json({ success: true, bookings });
  } catch (error) {
    next(error);
  }
}

export async function getAdminSystemHealth(req, res, next) {
  try {
    const [dbCheck, lastSuccess, lastFailure] = await Promise.all([
      get(`SELECT COUNT(*) AS count FROM users`),
      get(`SELECT * FROM payment_transactions WHERE LOWER(status) IN ('successful', 'success', 'completed', 'paid') ORDER BY updated_at DESC, id DESC LIMIT 1`),
      get(`SELECT * FROM payment_transactions WHERE LOWER(status) IN ('failed', 'cancelled', 'expired', 'error') ORDER BY updated_at DESC, id DESC LIMIT 1`),
    ]);
    const productionDatabaseReady = env.nodeEnv !== "production" || (env.dbClient === "postgres" && Boolean(env.databaseUrl));

    res.json({
      success: true,
      health: {
        backend: { status: "operational", checkedAt: new Date().toISOString() },
        database: {
          status: Number(dbCheck?.count || 0) >= 0 ? "connected" : "unknown",
          client: env.dbClient,
          environment: env.nodeEnv,
          persistent: env.dbClient === "postgres",
          productionReady: productionDatabaseReady,
          userCount: Number(dbCheck?.count || 0),
          note: "Connection details and secrets are intentionally not exposed.",
        },
        payments: { status: "configured", note: "Payment provider secrets are intentionally not exposed." },
        mtn: { status: "check_available", endpoint: "/api/payments/mtn/check-auth" },
        subscriptionLogic: { status: "active", rules: ["Premium customer unlocks Smart Match", "Platinum provider unlocks AI Business Coach"] },
        lastSuccessfulPaymentCallback: lastSuccess ? { id: lastSuccess.id, reference: lastSuccess.internal_reference, updatedAt: lastSuccess.updated_at } : null,
        lastFailedPaymentCallback: lastFailure ? { id: lastFailure.id, reference: lastFailure.internal_reference, updatedAt: lastFailure.updated_at } : null,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminDeploymentReadiness(req, res, next) {
  try {
    const readiness = await getDeploymentReadiness();
    res.json({ success: true, readiness });
  } catch (error) {
    next(error);
  }
}

export async function getAdminProviderPublicationReadiness(req, res, next) {
  try {
    const readiness = await getProviderPublicationReadiness();
    res.json({ success: true, readiness });
  } catch (error) {
    next(error);
  }
}

export async function cleanupAdminDemoBusinesses(req, res, next) {
  try {
    const confirmation = String(req.body.confirmation || "").trim();
    if (confirmation !== "SOFT DISABLE DEMO BUSINESSES") {
      throw httpError(400, "Type SOFT DISABLE DEMO BUSINESSES to confirm demo cleanup.");
    }

    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const result = await softDisableDemoBusinesses({
      ids,
      adminUser: req.user,
      reason: String(req.body.reason || "Production launch demo cleanup").trim(),
    });
    const readiness = await getDeploymentReadiness();

    res.json({
      success: true,
      message: `Soft-disabled ${result.disabledCount} suspected demo business record(s).`,
      cleanup: result,
      readiness,
    });
  } catch (error) {
    next(error);
  }
}

async function getProviderReadinessItem(businessId) {
  const readiness = await getProviderPublicationReadiness({ limit: 10000 });
  return readiness.businesses.find((item) => Number(item.id) === Number(businessId)) || null;
}

function hasAnyBlocker(item, blockers = []) {
  return blockers.some((blocker) => (item.blockers || []).includes(blocker));
}

function assertSafeProviderLaunchTarget(item) {
  if (!item) throw httpError(404, "Provider readiness row not found.");
  if (hasAnyBlocker(item, ["demo_or_test_like_business", "soft_deleted"])) {
    throw httpError(409, "Demo, test, or deleted businesses cannot be published or approved.");
  }
  if (hasAnyBlocker(item, ["missing_required_business_fields", "missing_services_or_category"])) {
    throw httpError(409, "Business details and at least one service are required before launch publication.");
  }
}

export async function remediateAdminDeploymentReadiness(req, res, next) {
  try {
    const action = String(req.body.action || "").trim().toLowerCase();
    const businessId = Number(req.body.businessId || req.body.business_id || 0);
    const reason = String(req.body.reason || "Admin deployment readiness remediation").trim();

    if (!action) throw httpError(400, "Remediation action is required.");

    let message = "Readiness remediation completed.";

    if (action === "soft_disable_demo_business") {
      if (!Number.isInteger(businessId) || businessId <= 0) throw httpError(400, "Business id is required.");
      const result = await softDisableDemoBusinesses({
        ids: [businessId],
        adminUser: req.user,
        reason,
      });
      if (!result.disabledCount) throw httpError(404, "Business is not in the demo/test suspect list.");
      message = `Soft-disabled ${result.disabledCount} demo/test business.`;
    } else {
      if (!Number.isInteger(businessId) || businessId <= 0) throw httpError(400, "Business id is required.");

      const item = await getProviderReadinessItem(businessId);
      if (!item) throw httpError(404, "Provider readiness row not found.");

      await transaction(async (client) => {
        const business = await client.get(`SELECT * FROM barbers WHERE id = ? AND deleted_at IS NULL`, [businessId]);
        if (!business) throw httpError(404, "Business not found.");
        const latestSubscription = await client.get(`SELECT * FROM barber_subscriptions WHERE barber_id = ? ORDER BY id DESC LIMIT 1`, [businessId]);

        if (action === "publish_provider") {
          assertSafeProviderLaunchTarget(item);
          if (hasAnyBlocker(item, ["missing_or_invalid_plan", "missing_subscription_trial_or_admin_approval"])) {
            throw httpError(409, "Plan, trial, or admin approval must be fixed before publishing.");
          }
          await client.run(`UPDATE barbers SET business_status = 'active', is_published = 1 WHERE id = ?`, [businessId]);
          await logAdminAction(client, req, {
            actionType: "deployment_publish_provider",
            targetType: "business",
            targetId: businessId,
            oldValue: business,
            newValue: { business_status: "active", is_published: 1 },
            reason,
          });
          message = "Provider published for launch.";
        } else if (action === "start_provider_trial") {
          assertSafeProviderLaunchTarget(item);
          const expiresAt = req.body.expiresAt || req.body.expires_at || addDays(Number(req.body.days || FREE_TRIAL_DAYS));
          const insert = await client.run(
            `INSERT INTO barber_subscriptions
             (barber_id, tier, price, status, billing_cycle, amount_paid, currency, payment_status, trial_status, payment_reference, provider, expires_at, activated_at, is_active)
             VALUES (?, 'PLUS', 0, 'trialing', 'monthly', 0, 'UGX', 'trial', 'active', ?, 'admin', ?, CURRENT_TIMESTAMP, 1)`,
            [businessId, `admin-readiness-trial-${businessId}-${Date.now()}`, expiresAt]
          );
          const nextSubscription = await client.get(`SELECT * FROM barber_subscriptions WHERE id = ?`, [insert.lastID]);
          await client.run(
            `UPDATE barbers
             SET subscription_tier = 'PLUS',
                 subscription_status = 'trialing',
                 subscription_expires_at = ?,
                 trial_status = 'active',
                 trial_ends_at = ?,
                 business_status = 'active',
                 is_published = 1
             WHERE id = ?`,
            [expiresAt, expiresAt, businessId]
          );
          await logAdminAction(client, req, {
            actionType: "deployment_start_provider_trial",
            targetType: "business",
            targetId: businessId,
            oldValue: latestSubscription || business,
            newValue: nextSubscription,
            reason,
          });
          message = "Provider launch trial started and published.";
        } else if (action === "admin_approve_provider") {
          assertSafeProviderLaunchTarget(item);
          await client.run(
            `UPDATE barbers
             SET subscription_tier = CASE
                   WHEN subscription_tier IN ('PLUS', 'PREMIUM', 'PLATINUM') THEN subscription_tier
                   ELSE 'PLUS'
                 END,
                 subscription_status = 'manual_approved',
                 business_status = 'approved',
                 is_published = 1,
                 admin_approved = 1
             WHERE id = ?`,
            [businessId]
          );
          await logAdminAction(client, req, {
            actionType: "deployment_admin_approve_provider",
            targetType: "business",
            targetId: businessId,
            oldValue: business,
            newValue: { subscription_status: "manual_approved", business_status: "approved", is_published: 1, admin_approved: 1 },
            reason,
          });
          message = "Provider admin approval applied and published.";
        } else if (action === "hold_incomplete_provider") {
          if (!hasAnyBlocker(item, ["missing_required_business_fields", "missing_services_or_category"])) {
            throw httpError(409, "This provider is not blocked by missing required details or services.");
          }
          await client.run(
            `UPDATE barbers
             SET business_status = 'almost_ready',
                 is_published = 0
             WHERE id = ?`,
            [businessId]
          );
          await logAdminAction(client, req, {
            actionType: "deployment_hold_incomplete_provider",
            targetType: "business",
            targetId: businessId,
            oldValue: business,
            newValue: { business_status: "almost_ready", is_published: 0 },
            reason,
          });
          message = "Incomplete provider held out of public launch.";
        } else {
          throw httpError(400, "Unsupported deployment readiness remediation action.");
        }
      });
    }

    const readiness = await getDeploymentReadiness();
    res.json({ success: true, message, readiness });
  } catch (error) {
    next(error);
  }
}

export async function getAdminSubscriptions(req, res, next) {
  try {
    const plan = getCustomerPremiumPlan();
    const providerPlans = PLAN_CODES.map((code) => getSubscriptionTierConfig(code));
    res.json({
      success: true,
      customerPlan: plan,
      providerPlans,
      featureMatrix: getFeatureRules(),
    });
  } catch (error) {
    next(error);
  }
}

export async function runAdminFeatureAccessTest(req, res, next) {
  try {
    const feature = String(req.body.feature || "").trim();
    const userId = Number(req.body.userId || 0);
    const businessId = Number(req.body.businessId || 0);
    const meta = getFeatureMeta(feature);
    if (!meta) throw httpError(400, "Unsupported access test feature.");

    let allowed = false;
    let reason = "Feature is locked for the selected account.";
    let subject = null;

    if (["smart_match", "browse_services", "book_service", "customer_wallet_topup", "checkout_payment", "subscription_upgrade", "subscription_expiry_lock"].includes(feature)) {
      const user = await get(`SELECT * FROM users WHERE id = ?`, [userId]);
      if (!user) throw httpError(404, "Customer account is required for this test.");
      const subscription = await getLatestCustomerSubscriptionForAdmin(userId);
      const premium = isActiveCustomerPremium(subscription);
      allowed = feature === "smart_match" || feature === "subscription_expiry_lock" ? premium : String(user.role).toLowerCase() === "customer";
      reason = allowed
        ? premium
          ? "Active Premium customer entitlement allows this feature."
          : "Free customer features are available to this account."
        : "Customer is not on an active paid Premium subscription.";
      subject = { id: user.id, name: user.username, role: user.role, tier: premium ? "PREMIUM" : "FREE", expiresAt: subscription?.expires_at || null };
    } else {
      const business = await get(`SELECT * FROM barbers WHERE id = ? AND deleted_at IS NULL`, [businessId]);
      if (!business) throw httpError(404, "Provider business is required for this test.");
      const subscription = await getLatestProviderSubscription(businessId);
      const tier = String(subscription?.tier || business.subscription_tier || "").toUpperCase();
      const active = ["active", "trialing"].includes(String(subscription?.status || business.subscription_status || "").toLowerCase());
      const platinum = isActiveProviderPlatinum(business, subscription);
      allowed = feature === "ai_coach" ? platinum : active && ["PLUS", "PREMIUM", "PLATINUM"].includes(tier);
      reason = allowed
        ? feature === "ai_coach"
          ? "Active Platinum provider entitlement allows AI Business Coach."
          : "Active provider plan allows this provider workflow."
        : feature === "ai_coach"
          ? "AI Business Coach is locked unless the provider has active Platinum."
          : "Provider plan is inactive, expired, or missing.";
      subject = { id: business.id, name: business.business_name, role: "provider", tier: tier || "NONE", status: subscription?.status || business.subscription_status };
    }

    const expectedAllowed = Boolean(allowed);
    res.json({
      success: true,
      result: {
        status: "PASS",
        feature,
        featureTested: meta.label,
        selectedSubject: subject,
        expectedAccess: expectedAllowed ? "allowed" : "blocked",
        actualAccess: allowed ? "allowed" : "blocked",
        actualApiResult: allowed ? 200 : 403,
        permissionDecision: allowed ? "allow" : "block",
        reason,
        timestamp: new Date().toISOString(),
        suggestedFix: allowed ? "" : "Upgrade the account to the required active plan, renew the expired subscription, or verify the backend entitlement query.",
        developerDetails: { featureRule: meta },
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getLatestCustomerSubscriptionForAdmin(userId) {
  return get(
    `SELECT *
     FROM customer_subscriptions
     WHERE user_id = ?
     ORDER BY COALESCE(activated_at, started_at, created_at) DESC, id DESC
     LIMIT 1`,
    [userId]
  );
}

export async function getAdminAuditLog(req, res, next) {
  try {
    const rows = await all(`SELECT * FROM admin_audit_log ORDER BY created_at DESC, id DESC LIMIT 300`);
    res.json({ success: true, auditLog: rows });
  } catch (error) {
    next(error);
  }
}

export async function getAdminReviews(req, res, next) {
  try {
    const rows = await all(
      `SELECT
         r.*,
         reviewer.username AS reviewer_username,
         reviewer_profile.full_name AS reviewer_name,
         b.business_name,
         b.owner_user_id,
         owner.username AS provider_username,
         blocker.username AS blocked_by_username
       FROM reviews r
       JOIN users reviewer ON reviewer.id = r.user_id
       LEFT JOIN profiles reviewer_profile ON reviewer_profile.user_id = reviewer.id
       JOIN barbers b ON b.id = r.barber_id
       LEFT JOIN users owner ON owner.id = b.owner_user_id
       LEFT JOIN users blocker ON blocker.id = r.blocked_by_user_id
       ORDER BY COALESCE(r.blocked_at, r.created_at) DESC, r.id DESC
       LIMIT 500`
    );
    res.json({ success: true, reviews: rows });
  } catch (error) {
    next(error);
  }
}

export async function getAdminSupportRequests(req, res, next) {
  try {
    const rows = await all(
      `SELECT
         sr.id,
         sr.user_id,
         sr.topic,
         sr.name,
         sr.contact,
         sr.booking_reference,
         sr.message,
         sr.status,
         sr.admin_notes,
         sr.created_at,
         sr.updated_at,
         u.username,
         u.role
       FROM support_requests sr
       JOIN users u ON u.id = sr.user_id
       ORDER BY sr.created_at DESC, sr.id DESC
       LIMIT 300`
    );
    res.json({ success: true, supportRequests: rows });
  } catch (error) {
    next(error);
  }
}

export async function updateAdminSupportRequest(req, res, next) {
  try {
    const supportRequestId = Number(req.params.id || 0);
    const requestedStatus = req.body.status === undefined ? null : String(req.body.status || "").trim().toLowerCase();
    const hasNotes = req.body.admin_notes !== undefined || req.body.adminNotes !== undefined || req.body.notes !== undefined;
    const adminNotes = hasNotes
      ? cleanAdminSupportText(req.body.admin_notes ?? req.body.adminNotes ?? req.body.notes, 2000)
      : null;
    const reason = cleanAdminSupportText(req.body.reason || "Admin support request update.", 500);

    if (!Number.isInteger(supportRequestId) || supportRequestId <= 0) {
      return res.status(400).json({ success: false, message: "Support request id is required." });
    }
    if (requestedStatus && !SUPPORT_REQUEST_STATUSES.has(requestedStatus)) {
      return res.status(400).json({ success: false, message: "Choose a valid support request status." });
    }
    if (!requestedStatus && !hasNotes) {
      return res.status(400).json({ success: false, message: "Status or admin notes are required." });
    }

    let supportRequest = null;
    await transaction(async (client) => {
      const before = await client.get(`SELECT * FROM support_requests WHERE id = ?`, [supportRequestId]);
      if (!before) throw httpError(404, "Support request not found.");

      const nextStatus = requestedStatus || before.status;
      const nextNotes = hasNotes ? adminNotes : before.admin_notes || "";
      await client.run(
        `UPDATE support_requests
         SET status = ?,
             admin_notes = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextStatus, nextNotes, supportRequestId]
      );
      const after = await client.get(`SELECT * FROM support_requests WHERE id = ?`, [supportRequestId]);
      await logAdminAction(client, req, {
        actionType: "support_request_updated",
        targetType: "support_request",
        targetId: supportRequestId,
        oldValue: { status: before.status, admin_notes: before.admin_notes || "" },
        newValue: { status: after.status, admin_notes: after.admin_notes || "" },
        reason,
      });
      supportRequest = after;
    });

    const rows = await all(
      `SELECT
         sr.id,
         sr.user_id,
         sr.topic,
         sr.name,
         sr.contact,
         sr.booking_reference,
         sr.message,
         sr.status,
         sr.admin_notes,
         sr.created_at,
         sr.updated_at,
         u.username,
         u.role
       FROM support_requests sr
       JOIN users u ON u.id = sr.user_id
       ORDER BY sr.created_at DESC, sr.id DESC
       LIMIT 300`
    );

    res.json({
      success: true,
      message: "Support request updated.",
      supportRequest,
      supportRequests: rows,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAdminBusiness(req, res, next) {
  try {
    const barberId = Number(req.params.id);
    const action = String(req.body.action || "").trim();
    const plan = String(req.body.plan || "").trim().toUpperCase();
    const days = Number(req.body.days || FREE_TRIAL_DAYS);
    const reason = String(req.body.reason || "").trim().slice(0, 500);

    if (!barberId) {
      return res.status(400).json({ success: false, message: "Business id is required." });
    }

    await transaction(async (client) => {
      const business = await client.get(`SELECT * FROM barbers WHERE id = ?`, [barberId]);
      if (!business) {
        const error = new Error("Business not found.");
        error.statusCode = 404;
        throw error;
      }

      if (action === "verify") {
        await client.run(
          `UPDATE barbers
           SET verified_status = 'Verified',
               verification_reviewed_at = CURRENT_TIMESTAMP,
               verification_reviewed_by = ?,
               verification_notes = ?
           WHERE id = ?`,
          [req.user?.id || null, reason || "Admin approved provider verification.", barberId]
        );
        const after = await client.get(`SELECT * FROM barbers WHERE id = ?`, [barberId]);
        await logAdminAction(client, req, {
          actionType: "provider_verification_approved",
          targetType: "business",
          targetId: barberId,
          oldValue: business,
          newValue: after,
          reason: reason || "Provider verification approved.",
        });
        return;
      }
      if (action === "mark_verification_pending") {
        await client.run(
          `UPDATE barbers
           SET verified_status = 'Pending verification',
               verification_submitted_at = COALESCE(verification_submitted_at, CURRENT_TIMESTAMP),
               verification_reviewed_at = NULL,
               verification_reviewed_by = NULL,
               verification_notes = ?
           WHERE id = ?`,
          [reason || "Waiting for provider verification review.", barberId]
        );
        const after = await client.get(`SELECT * FROM barbers WHERE id = ?`, [barberId]);
        await logAdminAction(client, req, {
          actionType: "provider_verification_pending",
          targetType: "business",
          targetId: barberId,
          oldValue: business,
          newValue: after,
          reason: reason || "Provider verification marked pending.",
        });
        return;
      }
      if (action === "reject_verification") {
        await client.run(
          `UPDATE barbers
           SET verified_status = 'Rejected',
               verification_reviewed_at = CURRENT_TIMESTAMP,
               verification_reviewed_by = ?,
               verification_notes = ?
           WHERE id = ?`,
          [req.user?.id || null, reason || "Admin rejected provider verification.", barberId]
        );
        const after = await client.get(`SELECT * FROM barbers WHERE id = ?`, [barberId]);
        await logAdminAction(client, req, {
          actionType: "provider_verification_rejected",
          targetType: "business",
          targetId: barberId,
          oldValue: business,
          newValue: after,
          reason: reason || "Provider verification rejected.",
        });
        return;
      }
      if (action === "suspend") {
        await client.run(`UPDATE barbers SET subscription_status = 'suspended' WHERE id = ?`, [barberId]);
        return;
      }
      if (action === "activate") {
        await client.run(`UPDATE barbers SET subscription_status = 'active' WHERE id = ?`, [barberId]);
        return;
      }
      if (action === "approve" || action === "manual_approve") {
        await client.run(
          `UPDATE barbers
           SET subscription_tier = CASE
                 WHEN subscription_tier IN ('PLUS', 'PREMIUM', 'PLATINUM') THEN subscription_tier
                 ELSE 'PLUS'
               END,
               subscription_status = 'manual_approved',
               business_status = 'approved',
               is_published = 1,
               admin_approved = 1
           WHERE id = ?`,
          [barberId]
        );
        return;
      }
      if (action === "deactivate") {
        await client.run(`UPDATE barbers SET subscription_status = 'inactive' WHERE id = ?`, [barberId]);
        return;
      }
      if (action === "extend_trial") {
        await client.run(
          `UPDATE barbers
           SET subscription_tier = 'PLUS',
               subscription_status = 'trial_extended',
               subscription_expires_at = ?
           WHERE id = ?`,
          [addDays(days), barberId]
        );
        return;
      }
      if (action === "reset_subscription") {
        await client.run(
          `UPDATE barbers
           SET subscription_tier = 'PLUS',
               subscription_status = 'active',
               subscription_expires_at = NULL,
               featured_until = NULL
           WHERE id = ?`,
          [barberId]
        );
        return;
      }
      if (action === "change_plan") {
        if (!PLAN_CODES.includes(plan)) {
          const error = new Error("Choose a provider plan to activate your business.");
          error.statusCode = 400;
          throw error;
        }
        const tierConfig = getSubscriptionTierConfig(plan);
        const expiresAt = addDays(30);
        const reference = `admin-${barberId}-${Date.now()}`;
        await client.run(
          `INSERT INTO barber_subscriptions
           (barber_id, tier, price, status, payment_reference, provider, started_at, expires_at, activated_at)
           VALUES (?, ?, ?, 'active', ?, 'admin', CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)`,
          [barberId, tierConfig.code, tierConfig.price, reference, expiresAt]
        );
        await client.run(
          `UPDATE barbers
           SET subscription_tier = ?,
               subscription_status = 'active',
               subscription_expires_at = ?,
               featured_until = CASE WHEN ? IN ('PREMIUM', 'PLATINUM') THEN ? ELSE featured_until END
           WHERE id = ?`,
          [tierConfig.code, expiresAt, tierConfig.code, expiresAt, barberId]
        );
        return;
      }

      const error = new Error("Unsupported admin action.");
      error.statusCode = 400;
      throw error;
    });

    const business = (await getBusinessRows()).map(mapBusiness).find((item) => Number(item.id) === barberId);
    res.json({ success: true, message: "Business updated.", business });
  } catch (error) {
    next(error);
  }
}

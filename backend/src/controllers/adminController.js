import { all, get, run, transaction } from "../db/query.js";
import { FREE_TRIAL_DAYS, getSubscriptionTierConfig } from "../services/paymentService.js";

const PLAN_CODES = ["PRO", "PREMIUM", "PLATINUM"];

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
       (SELECT COALESCE(AVG(r.rating), 0) FROM reviews r WHERE r.barber_id = b.id) AS average_rating,
       (SELECT COUNT(*) FROM reviews r WHERE r.barber_id = b.id) AS review_count,
       (SELECT tier FROM barber_subscriptions bs WHERE bs.barber_id = b.id ORDER BY id DESC LIMIT 1) AS latest_subscription_tier,
       (SELECT status FROM barber_subscriptions bs WHERE bs.barber_id = b.id ORDER BY id DESC LIMIT 1) AS latest_subscription_status,
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
      pro_businesses: businesses.filter((item) => item.current_plan === "PRO").length,
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

export async function updateAdminBusiness(req, res, next) {
  try {
    const barberId = Number(req.params.id);
    const action = String(req.body.action || "").trim();
    const plan = String(req.body.plan || "").trim().toUpperCase();
    const days = Number(req.body.days || FREE_TRIAL_DAYS);

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
        await client.run(`UPDATE barbers SET verified_status = 'Verified' WHERE id = ?`, [barberId]);
        return;
      }
      if (action === "reject_verification") {
        await client.run(`UPDATE barbers SET verified_status = 'Needs info' WHERE id = ?`, [barberId]);
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
                 WHEN subscription_tier IN ('PRO', 'PREMIUM', 'PLATINUM') THEN subscription_tier
                 ELSE 'PRO'
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
           SET subscription_tier = 'PRO',
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
           SET subscription_tier = 'PRO',
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
          const error = new Error("Choose PRO, PREMIUM, or PLATINUM.");
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

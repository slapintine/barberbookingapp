import bcrypt from "bcryptjs";
import db from "../config/db.js";
import { initDb } from "../db/initDb.js";
import { get, run } from "../db/query.js";
import { getSubscriptionEndDate, getSubscriptionTierConfig } from "../services/paymentService.js";

const allowQaSeed = process.env.NODE_ENV === "development" && process.env.ALLOW_QA_SEED === "true";

if (!allowQaSeed) {
  console.error(
    "Refusing to seed QA fixtures. Set NODE_ENV=development and ALLOW_QA_SEED=true to run this script against a local development database."
  );
  process.exit(1);
}

const PASSWORD = String(process.env.QA_SEED_PASSWORD || "").trim();
if (!PASSWORD || PASSWORD.length < 10) {
  console.error("Set QA_SEED_PASSWORD to a local-only password of at least 10 characters. The seed script does not commit or print QA passwords.");
  process.exit(1);
}
const now = new Date();

const FIXTURE_CUSTOMER = {
  username: "qa_customer",
  fullName: "Queless QA Customer",
  email: "qa.customer@queless.test",
  phone: "+256700100000",
};

const EXTRA_CUSTOMER_COUNT = 8;

const PROVIDERS = [
  {
    username: "qa_free_provider",
    tier: "FREE",
    businessName: "QA Free Starter Studio",
    fullName: "QA Free Owner",
    email: "qa.free@queless.test",
    phone: "+256700100101",
    serviceCount: 5,
    photoCount: 5,
    completed: 4,
    cancelled: 2,
    profileViews: 18,
    averagePrice: 12000,
    ratingSeed: [4, 4, 3],
  },
  {
    username: "qa_premium_provider",
    tier: "PREMIUM",
    businessName: "QA Premium Growth Studio",
    fullName: "QA Premium Owner",
    email: "qa.premium@queless.test",
    phone: "+256700100202",
    serviceCount: 20,
    photoCount: 20,
    completed: 8,
    cancelled: 1,
    profileViews: 72,
    averagePrice: 18000,
    ratingSeed: [5, 5, 4, 4],
  },
  {
    username: "qa_platinum_provider",
    tier: "PLATINUM",
    businessName: "QA Platinum Visibility Studio",
    fullName: "QA Platinum Owner",
    email: "qa.platinum@queless.test",
    phone: "+256700100303",
    serviceCount: 25,
    photoCount: 25,
    completed: 12,
    cancelled: 2,
    profileViews: 180,
    averagePrice: 26000,
    ratingSeed: [5, 5, 5, 4, 5],
  },
];

const PLATINUM_STAFF = [
  { username: "qa_platinum_manager", fullName: "QA Platinum Manager", email: "qa.platinum.manager@queless.test", role: "manager" },
  { username: "qa_platinum_scheduler", fullName: "QA Platinum Scheduler", email: "qa.platinum.scheduler@queless.test", role: "scheduler" },
  { username: "qa_platinum_pro", fullName: "QA Platinum Professional", email: "qa.platinum.pro@queless.test", role: "service_professional" },
  { username: "qa_platinum_analyst", fullName: "QA Platinum Analyst", email: "qa.platinum.analyst@queless.test", role: "view_only_analyst" },
];

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeBusinessName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isoDate(offsetDays = 0) {
  const date = new Date(now);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function portfolioItems(count, tier) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${tier.toLowerCase()}-photo-${index + 1}`,
    title: `${tier} result ${index + 1}`,
    service: index % 2 === 0 ? "Signature service" : "Home service",
    beforeImage: "",
    afterImage: "",
    note: `${tier} QA portfolio item ${index + 1}`,
  }));
}

function serviceRows(count, basePrice) {
  return Array.from({ length: count }, (_, index) => ({
    name: index % 3 === 0 ? `Signature service ${index + 1}` : index % 3 === 1 ? `Home service ${index + 1}` : `Express service ${index + 1}`,
    category: index % 2 === 0 ? "Barber" : "Home Services",
    price: basePrice + index * 1000,
    duration: 30 + (index % 3) * 15,
    description: `QA service ${index + 1} for plan limit testing.`,
    featured: index < 3,
  }));
}

async function upsertUser({ username, role, fullName, email, phone }) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const existing = await get(`SELECT id FROM users WHERE username = ?`, [username]);

  let userId = existing?.id;
  if (userId) {
    await run(`UPDATE users SET password_hash = ?, role = ? WHERE id = ?`, [passwordHash, role, userId]);
  } else {
    const result = await run(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`, [username, passwordHash, role]);
    userId = result.lastID;
  }

  const profile = await get(`SELECT id FROM profiles WHERE user_id = ?`, [userId]);
  const profileParams = [
    fullName,
    phone,
    email,
    normalizeEmail(email),
    normalizePhone(phone),
    "Kampala, Uganda",
    role === "provider" ? "active" : "none",
    userId,
  ];

  if (profile) {
    await run(
      `UPDATE profiles
       SET full_name = ?, phone = ?, email = ?, normalized_email = ?, normalized_phone = ?, address = ?, subscription_status = ?
       WHERE user_id = ?`,
      profileParams
    );
  } else {
    await run(
      `INSERT INTO profiles
       (full_name, phone, email, normalized_email, normalized_phone, address, subscription_status, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      profileParams
    );
  }

  return userId;
}

async function upsertProviderBusiness(provider, ownerUserId) {
  const plan = getSubscriptionTierConfig(provider.tier);
  const existing = await get(`SELECT id FROM barbers WHERE owner_user_id = ?`, [ownerUserId]);
  const expiresAt = getSubscriptionEndDate(now, "monthly");
  const featuredUntil = provider.tier === "PLATINUM" ? expiresAt : null;
  const portfolio = portfolioItems(provider.photoCount, provider.tier);
  const params = [
    provider.businessName,
    normalizeBusinessName(provider.businessName),
    "Kampala, Uganda",
    0.3476,
    32.5825,
    provider.averagePrice,
    provider.tier === "PLATINUM" ? "Verified" : "New",
    "Barber",
    provider.tier === "FREE" ? 0 : 1,
    `${plan.name} QA fixture with realistic dashboard and report data.`,
    JSON.stringify(portfolio),
    provider.tier,
    plan.id,
    "active",
    expiresAt,
    "active",
    1,
    1,
    1,
    featuredUntil,
    null,
    ownerUserId,
  ];

  if (existing) {
    await run(
      `UPDATE barbers
       SET business_name = ?, normalized_business_name = ?, location = ?, latitude = ?, longitude = ?,
           price_from = ?, verified_status = ?, business_type = ?, home_service_enabled = ?, intro_text = ?,
           portfolio_json = ?, subscription_tier = ?, selected_plan = ?, subscription_status = ?,
           subscription_expires_at = ?, business_status = ?, is_published = ?, admin_approved = ?, accepts_cash = ?,
           featured_until = ?, deleted_at = ?
       WHERE owner_user_id = ?`,
      params
    );
    return existing.id;
  }

  const result = await run(
    `INSERT INTO barbers
     (business_name, normalized_business_name, location, latitude, longitude, price_from, verified_status,
      business_type, home_service_enabled, intro_text, portfolio_json, subscription_tier, selected_plan,
      subscription_status, subscription_expires_at, business_status, is_published, admin_approved, accepts_cash,
      featured_until, deleted_at, owner_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params
  );
  return result.lastID;
}

async function seedServices(barberId, provider) {
  await run(`DELETE FROM barber_services WHERE barber_id = ?`, [barberId]);
  for (const service of serviceRows(provider.serviceCount, provider.averagePrice)) {
    await run(
      `INSERT INTO barber_services
       (barber_id, service_name, category, price_extra, pricing_type, duration_minutes, location_type, description, is_available, image, is_featured)
       VALUES (?, ?, ?, ?, 'fixed', ?, ?, ?, 1, '', ?)`,
      [
        barberId,
        service.name,
        service.category,
        service.price,
        service.duration,
        provider.tier === "FREE" ? "provider_location" : "customer_location",
        service.description,
        service.featured ? 1 : 0,
      ]
    );
  }
}

async function seedSchedule(barberId) {
  for (let day = 0; day <= 6; day += 1) {
    await run(
      `INSERT INTO barber_schedule (barber_id, day_of_week, is_open, start_time, end_time, break_start, break_end)
       VALUES (?, ?, ?, '08:00', '20:00', 'NONE', NULL)
       ON CONFLICT(barber_id, day_of_week) DO UPDATE SET is_open = excluded.is_open, start_time = excluded.start_time, end_time = excluded.end_time`,
      [barberId, day, day === 0 ? 0 : 1]
    );
  }
}

async function seedSubscription(barberId, provider) {
  const plan = getSubscriptionTierConfig(provider.tier);
  await run(`DELETE FROM barber_subscriptions WHERE barber_id = ?`, [barberId]);
  await run(
    `INSERT INTO barber_subscriptions
     (barber_id, tier, price, status, billing_cycle, amount_paid, currency, payment_status, is_active, payment_reference, provider, started_at, expires_at, activated_at)
     VALUES (?, ?, ?, 'active', 'monthly', ?, 'UGX', 'paid', 1, ?, 'qa_seed', CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)`,
    [barberId, provider.tier, plan.monthlyPrice, plan.monthlyPrice, `qa-${provider.tier.toLowerCase()}-${barberId}`, getSubscriptionEndDate(now, "monthly")]
  );
}

async function seedPlatinumOperations(barberId) {
  const services = await new Promise((resolve, reject) => {
    db.all(`SELECT id FROM barber_services WHERE barber_id = ? ORDER BY id ASC LIMIT 4`, [barberId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  await run(`DELETE FROM provider_locations WHERE barber_id = ?`, [barberId]);
  await run(`DELETE FROM barber_team_members WHERE barber_id = ?`, [barberId]);
  const branchRows = [
    { name: "QA Platinum Central Branch", area: "Kampala", address: "QA Plot 10, Kampala" },
    { name: "QA Platinum Wakiso Branch", area: "Wakiso", address: "QA Plot 22, Wakiso" },
  ];
  const branches = [];
  for (const [index, branch] of branchRows.entries()) {
    const result = await run(
      `INSERT INTO provider_locations (barber_id, name, address, area, city, is_primary, is_active, booking_instructions)
       VALUES (?, ?, ?, ?, 'Uganda', ?, 1, ?)`,
      [barberId, branch.name, branch.address, branch.area, index === 0 ? 1 : 0, "QA local branch instructions."]
    );
    branches.push({ ...branch, id: result.lastID });
    for (let day = 1; day <= 6; day += 1) {
      await run(
        `INSERT INTO provider_location_schedule (barber_id, location_id, day_of_week, is_open, start_time, end_time)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(location_id, day_of_week) DO UPDATE SET is_open = 1, start_time = excluded.start_time, end_time = excluded.end_time`,
        [barberId, result.lastID, day, index === 0 ? "08:00" : "10:00", index === 0 ? "19:00" : "18:00"]
      );
    }
  }

  const staffSummary = [];
  for (const [index, staff] of PLATINUM_STAFF.entries()) {
    const userId = await upsertUser({
      username: staff.username,
      role: "customer",
      fullName: staff.fullName,
      email: staff.email,
      phone: `+25670020${String(index + 1).padStart(4, "0")}`,
    });
    const result = await run(
      `INSERT INTO barber_team_members (barber_id, user_id, name, display_name, email, role, title, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [barberId, userId, staff.fullName, staff.fullName, staff.email, staff.role, staff.role.replace(/_/g, " ")]
    );
    const staffId = result.lastID;
    staffSummary.push({ username: staff.username, role: staff.role, staffId });
    const branch = branches[index % branches.length];
    await run(
      `INSERT INTO staff_location_assignments (barber_id, staff_id, location_id, is_active)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(barber_id, staff_id, location_id) DO UPDATE SET is_active = 1`,
      [barberId, staffId, branch.id]
    );
    for (const service of services.filter((_, serviceIndex) => serviceIndex % PLATINUM_STAFF.length === index % PLATINUM_STAFF.length || index < 2)) {
      await run(
        `INSERT INTO staff_service_assignments (barber_id, staff_id, service_id, is_active)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(barber_id, staff_id, service_id) DO UPDATE SET is_active = 1`,
        [barberId, staffId, service.id]
      );
    }
    for (let day = 1; day <= 5; day += 1) {
      await run(
        `INSERT INTO staff_schedules (barber_id, staff_id, day_of_week, is_available, start_time, end_time, transition_minutes)
         VALUES (?, ?, ?, 1, ?, ?, 10)
         ON CONFLICT(barber_id, staff_id, day_of_week) DO UPDATE SET is_available = 1, start_time = excluded.start_time, end_time = excluded.end_time, transition_minutes = 10`,
        [barberId, staffId, day, index === 2 ? "10:00" : "09:00", index === 2 ? "16:00" : "18:00"]
      );
    }
  }
  const bookings = await new Promise((resolve, reject) => {
    db.all(`SELECT id FROM bookings WHERE barber_id = ? ORDER BY booking_date DESC, id DESC LIMIT 6`, [barberId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
  for (const [index, booking] of bookings.entries()) {
    const staff = staffSummary[index % staffSummary.length];
    const branch = branches[index % branches.length];
    if (index < 4) {
      await run(
        `UPDATE bookings
         SET assigned_staff_id = ?, team_member_id = ?, provider_location_id = ?,
             provider_location_snapshot = ?
         WHERE id = ? AND barber_id = ?`,
        [staff.staffId, staff.staffId, branch.id, JSON.stringify({ name: branch.name, area: branch.area }), booking.id, barberId]
      );
    }
  }
  return { branches, staffSummary };
}

async function seedBookingsAndReviews(barberId, customerUserIds, provider) {
  await run(`DELETE FROM reviews WHERE barber_id = ?`, [barberId]);
  await run(`DELETE FROM bookings WHERE barber_id = ?`, [barberId]);

  const totalBookings = provider.completed + provider.cancelled + 3;
  const reviewRatings = [...provider.ratingSeed];
  let firstCompletedBookingId = null;
  let totalEarnings = 0;

  for (let index = 0; index < totalBookings; index += 1) {
    const isCompleted = index < provider.completed;
    const isCancelled = index >= provider.completed && index < provider.completed + provider.cancelled;
    const status = isCompleted ? "completed" : isCancelled ? "cancelled" : "confirmed";
    const price = provider.averagePrice + (index % 4) * 2500;
    const bookingDate = isoDate(-index - 1);
    const paymentMethod = index % 3 === 0 ? "cash" : "mtn_mobile_money";
    const paymentStatus = isCompleted ? "paid" : isCancelled ? "cancelled" : "unpaid";
    const barberAmount = isCompleted ? price : 0;
    const customerUserId = customerUserIds[index % customerUserIds.length];

    const bookingResult = await run(
      `INSERT INTO bookings
       (barber_id, customer_user_id, service_name, booking_date, booking_time, price, service_duration_minutes,
        status, payment_method, payment_status, paid_at, payment_reference, payment_provider, commission_amount, barber_amount, cancelled_by, cancellation_reason)
       VALUES (?, ?, ?, ?, ?, ?, 45, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        barberId,
        customerUserId,
        `QA service ${index + 1}`,
        bookingDate,
        `${String(9 + (index % 7)).padStart(2, "0")}:00`,
        price,
        status,
        paymentMethod,
        paymentStatus,
        isCompleted ? `${bookingDate}T10:00:00.000Z` : null,
        `qa-booking-${barberId}-${index + 1}`,
        paymentMethod === "cash" ? "" : paymentMethod,
        paymentMethod === "cash" ? 0 : Number((price * 0.1).toFixed(2)),
        barberAmount,
        isCancelled ? "customer" : null,
        isCancelled ? "QA cancellation for dashboard testing" : "",
      ]
    );

    if (isCompleted) {
      totalEarnings += barberAmount;
      firstCompletedBookingId ||= bookingResult.lastID;
      if (reviewRatings.length) {
        const rating = reviewRatings.shift();
        const reviewText = rating >= 4
          ? "Friendly, clean and fast service. Pricing was clear and the result looked great."
          : "The service was okay but the wait felt slow and communication could improve.";
        await run(
          `INSERT INTO reviews (booking_id, barber_id, user_id, rating, review_text)
           VALUES (?, ?, ?, ?, ?)`,
          [bookingResult.lastID, barberId, customerUserId, rating, reviewText]
        );
      }
    }
  }

  const wallet = await get(`SELECT id FROM barber_wallets WHERE barber_id = ?`, [barberId]);
  if (wallet) {
    await run(
      `UPDATE barber_wallets
       SET pending_balance = ?, available_balance = ?, locked_balance = 0, total_earned = ?, withdrawn_total = ?, updated_at = CURRENT_TIMESTAMP
       WHERE barber_id = ?`,
      [Math.round(totalEarnings * 0.18), Math.round(totalEarnings * 0.72), totalEarnings, Math.round(totalEarnings * 0.1), barberId]
    );
    await run(`DELETE FROM wallet_transactions WHERE wallet_id = ?`, [wallet.id]);
    await run(
      `INSERT INTO wallet_transactions
       (wallet_id, booking_id, direction, amount, type, transaction_type, entry_type, reference, note)
       VALUES (?, ?, 'credit', ?, 'booking_payment', 'booking_payment', 'posted', ?, ?)`,
      [wallet.id, firstCompletedBookingId, Math.round(totalEarnings * 0.72), `qa-wallet-${barberId}`, "QA booking earnings released to available balance"]
    );
  } else {
    const walletResult = await run(
      `INSERT INTO barber_wallets (barber_id, pending_balance, available_balance, locked_balance, total_earned, withdrawn_total)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [barberId, Math.round(totalEarnings * 0.18), Math.round(totalEarnings * 0.72), totalEarnings, Math.round(totalEarnings * 0.1)]
    );
    await run(
      `INSERT INTO wallet_transactions
       (wallet_id, booking_id, direction, amount, type, transaction_type, entry_type, reference, note)
       VALUES (?, ?, 'credit', ?, 'booking_payment', 'booking_payment', 'posted', ?, ?)`,
      [walletResult.lastID, firstCompletedBookingId, Math.round(totalEarnings * 0.72), `qa-wallet-${barberId}`, "QA booking earnings released to available balance"]
    );
  }
}

async function seedProvider(provider, customerUserIds) {
  const ownerUserId = await upsertUser({
    username: provider.username,
    role: "provider",
    fullName: provider.fullName,
    email: provider.email,
    phone: provider.phone,
  });

  await run(
    `UPDATE profiles
     SET selected_plan = ?, trial_used = 1, trial_plan = ?, trial_business_id = COALESCE(trial_business_id, 0)
     WHERE user_id = ?`,
    [provider.tier.toLowerCase(), provider.tier.toLowerCase(), ownerUserId]
  );

  const barberId = await upsertProviderBusiness(provider, ownerUserId);
  await run(`UPDATE profiles SET trial_business_id = ? WHERE user_id = ?`, [barberId, ownerUserId]);
  await seedServices(barberId, provider);
  await seedSchedule(barberId);
  await seedSubscription(barberId, provider);
  await seedBookingsAndReviews(barberId, customerUserIds, provider);
  const operations = provider.tier === "PLATINUM" ? await seedPlatinumOperations(barberId) : null;
  await run(
    `INSERT INTO subscription_events (user_id, business_id, event_type, plan_id, status, metadata)
     VALUES (?, ?, 'qa_seeded', ?, 'active', ?)`,
    [ownerUserId, barberId, provider.tier.toLowerCase(), JSON.stringify({ serviceCount: provider.serviceCount, photoCount: provider.photoCount })]
  );

  return { username: provider.username, tier: provider.tier, barberId, operations };
}

async function main() {
  await initDb();

  const primaryCustomerUserId = await upsertUser({
    username: FIXTURE_CUSTOMER.username,
    role: "customer",
    fullName: FIXTURE_CUSTOMER.fullName,
    email: FIXTURE_CUSTOMER.email,
    phone: FIXTURE_CUSTOMER.phone,
  });
  const customerUserIds = [primaryCustomerUserId];
  for (let index = 1; index <= EXTRA_CUSTOMER_COUNT; index += 1) {
    customerUserIds.push(await upsertUser({
      username: `qa_customer_${index}`,
      role: "customer",
      fullName: `Queless QA Customer ${index}`,
      email: `qa.customer.${index}@queless.test`,
      phone: `+25670010${String(index).padStart(4, "0")}`,
    }));
  }

  const seeded = [];
  for (const provider of PROVIDERS) {
    seeded.push(await seedProvider(provider, customerUserIds));
  }

  console.log("Seeded Queless plan QA fixtures:");
  console.table([
    { username: FIXTURE_CUSTOMER.username, role: "customer", tier: "" },
    ...seeded.map((item) => ({ username: item.username, role: "provider", tier: item.tier, barberId: item.barberId })),
    ...PLATINUM_STAFF.map((item) => ({ username: item.username, role: item.role, tier: "PLATINUM staff" })),
  ]);
  console.log("Use the local-only QA_SEED_PASSWORD value you supplied. It is not printed by this script.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    if (typeof db.close === "function") db.close();
  });

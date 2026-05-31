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

const PASSWORD = "PlanQa123";
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
    username: "qa_plus_provider",
    tier: "PLUS",
    businessName: "QA Plus Starter Studio",
    fullName: "QA Plus Owner",
    email: "qa.plus@queless.test",
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
    category: index % 2 === 0 ? "Beauty & Grooming" : "Home Services",
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
    "Beauty & Grooming",
    provider.tier === "PLUS" ? 0 : 1,
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
        provider.tier === "PLUS" ? "provider_location" : "customer_location",
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
  await run(
    `INSERT INTO subscription_events (user_id, business_id, event_type, plan_id, status, metadata)
     VALUES (?, ?, 'qa_seeded', ?, 'active', ?)`,
    [ownerUserId, barberId, provider.tier.toLowerCase(), JSON.stringify({ serviceCount: provider.serviceCount, photoCount: provider.photoCount })]
  );

  return { username: provider.username, password: PASSWORD, tier: provider.tier, barberId };
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
    { username: FIXTURE_CUSTOMER.username, password: PASSWORD, role: "customer", tier: "" },
    ...seeded.map((item) => ({ username: item.username, password: item.password, role: "provider", tier: item.tier, barberId: item.barberId })),
  ]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    if (typeof db.close === "function") db.close();
  });

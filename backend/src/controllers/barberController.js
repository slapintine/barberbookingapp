import db from "../config/db.js";
import {
  FREE_TRIAL_DAYS,
  getSubscriptionTierConfig,
  getTierRank,
  isValidProviderPlan,
  normalizeProviderPlan,
} from "../services/paymentService.js";
import {
  isBusinessPubliclyVisible,
  publicBusinessParams,
  publicBusinessWhere,
} from "../services/businessVisibility.js";

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function updateUserRole(userId, role) {
  return run(`UPDATE users SET role = ? WHERE id = ?`, [role, userId]);
}

function getBarberByOwnerUserId(ownerUserId) {
  return get(
    `SELECT
      b.id,
      b.owner_user_id,
      b.business_name,
      b.location,
      b.latitude,
      b.longitude,
      b.price_from,
      b.verified_status,
      b.image,
      b.availability_start,
      b.availability_end,
      b.accepts_wallet,
      b.accepts_cash,
      b.stand_type,
      b.business_type,
      b.home_service_enabled,
      b.intro_text,
      b.portfolio_json,
      b.subscription_tier,
      b.selected_plan,
      b.subscription_status,
      b.subscription_expires_at,
      b.business_status,
      b.is_published,
      b.admin_approved,
      b.is_demo,
      b.normalized_business_name,
      b.trial_plan,
      b.trial_started_at,
      b.trial_ends_at,
      b.trial_status,
      b.used_trials,
      b.deleted_at,
      b.created_at,
      u.username
     FROM barbers b
     JOIN users u ON u.id = b.owner_user_id
     WHERE b.owner_user_id = ?`,
    [ownerUserId]
  );
}

function getServicesForBarber(barberId) {
  return all(
    `SELECT id, service_name, category, price_extra, pricing_type, min_price, max_price, starting_price, duration_minutes, location_type, description, is_available, image, is_featured
     FROM barber_services
     WHERE barber_id = ?
     ORDER BY id ASC`,
    [barberId]
  );
}

function getScheduleForBarber(barberId) {
  return all(
    `SELECT day_of_week, is_open, start_time, end_time, break_start, break_end
     FROM barber_schedule
     WHERE barber_id = ?
     ORDER BY day_of_week ASC`,
    [barberId]
  );
}

function getTeamMembersForBarber(barberId) {
  return all(
    `SELECT id, barber_id, name, title, bio, image, specialties, is_active, created_at, updated_at
     FROM barber_team_members
     WHERE barber_id = ?
     ORDER BY id ASC`,
    [barberId]
  );
}

function normalizeStandType(value) {
  return String(value || "").trim().toLowerCase() === "shop" ? "shop" : "individual";
}

function normalizeBusinessType(value) {
  const normalized = String(value || "").trim();
  return normalized || "Beauty & Grooming";
}

function normalizeBusinessName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeBusinessStatus(value, plan) {
  const status = String(value || "").trim().toLowerCase();
  const normalizedPlan = normalizeProviderPlan(plan);
  if (!normalizedPlan) return "pending_subscription";
  if (["active", "approved", "live", "trialing", "draft", "pending_subscription", "pending_payment", "expired", "suspended", "deleted"].includes(status)) return status;
  return "pending_subscription";
}

function parseJsonArray(value, fallback = []) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizePortfolioItems(input = []) {
  return parseJsonArray(input, [])
    .map((item, index) => ({
      id: item?.id || `portfolio-${index}`,
      title: String(item?.title || item?.label || "Transformation").trim(),
      service: String(item?.service || "").trim(),
      beforeImage: String(item?.beforeImage || item?.before_image || "").trim(),
      afterImage: String(item?.afterImage || item?.after_image || "").trim(),
      note: String(item?.note || "").trim(),
    }))
    .filter((item) => item.beforeImage || item.afterImage);
}

function getTrialEndDate(startedAt) {
  const base = startedAt ? new Date(startedAt) : new Date();
  base.setDate(base.getDate() + FREE_TRIAL_DAYS);
  return base;
}

function getRemainingTrialDays(trialEndsAt) {
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function normalizeTeamMembers(input = []) {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (typeof item === "string") {
        return { name: item.trim() };
      }

      return {
        name: String(item?.name || "").trim(),
        title: String(item?.title || "Service agent").trim() || "Service agent",
        bio: String(item?.bio || "").trim(),
        image: String(item?.image || "").trim(),
        specialties: Array.isArray(item?.specialties)
          ? item.specialties.join(", ")
          : String(item?.specialties || "").trim(),
        is_active: item?.is_active === false ? 0 : 1,
      };
    })
    .filter((item) => item.name);
}

function seedDefaultWeeklySchedule(barberId) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      `INSERT INTO barber_schedule
       (barber_id, day_of_week, is_open, start_time, end_time, break_start, break_end)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(barber_id, day_of_week) DO NOTHING`
    );

    for (let day = 0; day <= 6; day += 1) {
      const isSunday = day === 0;
      stmt.run(
        barberId,
        day,
        isSunday ? 0 : 1,
        "08:00",
        "20:00",
        "NONE",
        null
      );
    }

    stmt.finalize((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function logAudit(userId, action) {
  return run(
    `INSERT INTO audit_logs (user_id, action) VALUES (?, ?)`,
    [userId || null, action]
  ).catch(() => {});
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeIdentityEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeIdentityPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

async function replaceBarberServices(barberId, services = [], serviceLimit = -1) {
  const limit = Number(serviceLimit);
  if (limit > -1 && services.length > limit) {
    throw validationError(`You have reached the ${limit} service limit for your plan. Upgrade to add more.`);
  }
  await run(`DELETE FROM barber_services WHERE barber_id = ?`, [barberId]);

  for (const service of services) {
    const pricingType = String(service.pricing_type || service.pricingType || "fixed").trim().toLowerCase();
    const normalizedPricingType = ["fixed", "range", "starting_from", "quote"].includes(pricingType) ? pricingType : "fixed";
    const price = Number(service.price_extra ?? service.price ?? 0);
    const minPrice = Number(service.min_price ?? service.minPrice ?? 0);
    const maxPrice = Number(service.max_price ?? service.maxPrice ?? 0);
    const startingPrice = Number(service.starting_price ?? service.startingPrice ?? 0);

    if (normalizedPricingType === "fixed" && price <= 0) {
      throw validationError("Please enter a valid price.");
    }
    if (normalizedPricingType === "range") {
      if (minPrice <= 0 || maxPrice <= 0) throw validationError("Please complete the price range before saving.");
      if (maxPrice <= minPrice) throw validationError("Maximum price must be greater than minimum price.");
    }
    if (normalizedPricingType === "starting_from" && startingPrice <= 0) {
      throw validationError("Please enter a valid price.");
    }

    await run(
      `INSERT INTO barber_services
       (barber_id, service_name, category, price_extra, pricing_type, min_price, max_price, starting_price, duration_minutes, location_type, description, is_available, image, is_featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        barberId,
        service.service_name || "",
        service.category || service.service_category || "",
        normalizedPricingType === "fixed" ? price : 0,
        normalizedPricingType,
        normalizedPricingType === "range" ? minPrice : null,
        normalizedPricingType === "range" ? maxPrice : null,
        normalizedPricingType === "starting_from" ? startingPrice : null,
        Number(service.duration_minutes || 30),
        service.location_type || "provider_location",
        service.description || "",
        service.is_available === false || Number(service.is_available) === 0 ? 0 : 1,
        service.image || service.service_image || "",
        service.is_featured ? 1 : 0,
      ]
    );
  }
}

async function replaceTeamMembers(barberId, teamMembers = []) {
  await run(`DELETE FROM barber_team_members WHERE barber_id = ?`, [barberId]);

  for (const member of normalizeTeamMembers(teamMembers)) {
    await run(
      `INSERT INTO barber_team_members
       (barber_id, name, title, bio, image, specialties, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        barberId,
        member.name,
        member.title || "Service agent",
        member.bio || "",
        member.image || "",
        member.specialties || "",
        member.is_active === 0 ? 0 : 1,
      ]
    );
  }
}

function getLatestSubscription(barberId) {
  return get(
    `SELECT tier, price, status, payment_status, trial_status, started_at, expires_at, activated_at
     FROM barber_subscriptions
     WHERE barber_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [barberId]
  );
}

function buildSubscriptionMetadata(barber, latestSubscription) {
  const tierCode = normalizeProviderPlan(latestSubscription?.tier || barber?.subscription_tier);
  const trialEndsAt = barber?.trial_ends_at || null;
  const rawStatus = String(latestSubscription?.status || barber?.subscription_status || barber?.trial_status || "").toLowerCase();
  const trialActive =
    (rawStatus === "trialing" || rawStatus === "trial") &&
    trialEndsAt &&
    Date.now() < new Date(trialEndsAt).getTime();

  if (!tierCode) {
    return {
      tier: "LOCKED",
      name: "No active plan",
      price: 0,
      status: "none",
      expires_at: null,
      is_trial: false,
      trial_days_total: FREE_TRIAL_DAYS,
      trial_days_left: 0,
      fallback_tier_after_trial: null,
      features: {
        rankingWeight: 0,
        analyticsLevel: "locked",
        homepageFeatured: false,
        searchPriority: 0,
        topBarberBadge: false,
        verifiedBadge: false,
        adsPlacement: false,
        promotionsEnabled: false,
        marketingPushEnabled: false,
        homeServiceEnabled: false,
        profileCustomizationLevel: "locked",
        visibilityLabel: "Plan required",
        supportLevel: "Choose PRO, PREMIUM, or PLATINUM",
        serviceLimit: 0,
        photoLimit: 0,
        videoLimit: 0,
        reviewsEnabled: false,
        earningsTracking: false,
        bookingAnalytics: false,
        customBrandingHighlight: false,
        portfolioEnabled: false,
        beforeAfterGalleryEnabled: false,
        advancedAnalytics: false,
        aiBusinessCoach: false,
        reviewInsights: false,
        videoUploads: false,
        homepageFeature: false,
        priorityRanking: false,
        customBanner: false,
        aiWeeklyReport: false,
      },
    };
  }

  const tierConfig = getSubscriptionTierConfig(tierCode);

  return {
    tier: tierConfig.code,
    name: tierConfig.name,
    price: Number(latestSubscription?.price ?? tierConfig.price ?? 0),
    status: trialActive ? "trialing" : latestSubscription?.status || barber?.subscription_status || "pending_payment",
    expires_at: trialActive ? trialEndsAt : latestSubscription?.expires_at || barber?.subscription_expires_at || null,
    is_trial: trialActive,
    trial_days_total: FREE_TRIAL_DAYS,
    trial_days_left: trialActive ? getRemainingTrialDays(trialEndsAt) : 0,
    fallback_tier_after_trial: null,
    features: {
      rankingWeight: tierConfig.rankingWeight,
      analyticsLevel: tierConfig.analyticsLevel,
      homepageFeatured: tierConfig.homepageFeatured,
      searchPriority: tierConfig.searchPriority,
      topBarberBadge: tierConfig.topBarberBadge,
      verifiedBadge: tierConfig.verifiedBadge,
      adsPlacement: tierConfig.adsPlacement,
      promotionsEnabled: tierConfig.promotionsEnabled,
      marketingPushEnabled: tierConfig.marketingPushEnabled,
      homeServiceEnabled: tierConfig.homeServiceEnabled,
      profileCustomizationLevel: tierConfig.profileCustomizationLevel,
      visibilityLabel: tierConfig.visibilityLabel,
      supportLevel: tierConfig.supportLevel,
      serviceLimit: tierConfig.serviceLimit,
      photoLimit: tierConfig.photoLimit,
      videoLimit: tierConfig.videoLimit,
      reviewsEnabled: tierConfig.reviewsEnabled,
      earningsTracking: tierConfig.earningsTracking,
      bookingAnalytics: tierConfig.bookingAnalytics,
      customBrandingHighlight: tierConfig.customBrandingHighlight,
      portfolioEnabled: tierConfig.portfolioEnabled,
      beforeAfterGalleryEnabled: tierConfig.beforeAfterGalleryEnabled,
      advancedAnalytics: tierConfig.advancedAnalytics,
      aiBusinessCoach: tierConfig.aiBusinessCoach,
      reviewInsights: tierConfig.reviewInsights,
      videoUploads: tierConfig.videoUploads,
      homepageFeature: tierConfig.homepageFeature,
      priorityRanking: tierConfig.priorityRanking,
      customBanner: tierConfig.customBanner,
      aiWeeklyReport: tierConfig.aiWeeklyReport,
    },
  };
}

export async function registerBarber(req, res, next) {
  try {
    const {
      business_name,
      location,
      latitude = null,
      longitude = null,
      price_from = 0,
      image = null,
      accepts_wallet = false,
      accepts_cash = true,
      services = [],
      stand_type = "individual",
      team_members = [],
      business_type = "Beauty & Grooming",
      home_service_enabled = false,
      intro_text = "",
      portfolio = [],
      selected_plan,
      plan,
    } = req.body;
    const normalizedStandType = normalizeStandType(stand_type);
    const normalizedBusinessType = normalizeBusinessType(business_type);
    const normalizedPortfolio = normalizePortfolioItems(portfolio);
    const planConfig = getSubscriptionTierConfig(barber.subscription_tier || barber.selected_plan || "PRO");
    if (Number(planConfig.photoLimit) > -1 && normalizedPortfolio.length > Number(planConfig.photoLimit)) {
      throw validationError(`You have reached the ${planConfig.name} limit of ${planConfig.photoLimit} photos. Upgrade to add more.`);
    }
    const normalizedName = normalizeBusinessName(business_name);

    if (!business_name || !location) {
      return res.status(400).json({
        success: false,
        message: "Business name and location are required."
      });
    }

    const existing = await getBarberByOwnerUserId(req.user.id);
    if (existing) {
      const existingDeleted = String(existing.business_status || "").toLowerCase() === "deleted";
      return res.status(409).json({
        success: false,
        code: existingDeleted ? "BUSINESS_REACTIVATION_REQUIRED" : "PROVIDER_PROFILE_EXISTS",
        message: existingDeleted
          ? "This business has already used a trial. Please subscribe to reactivate it."
          : "You already have a provider profile."
      });
    }

    const duplicateBusiness = await get(
      `SELECT id FROM barbers
       WHERE normalized_business_name = ?
          OR LOWER(TRIM(REPLACE(REPLACE(REPLACE(business_name, '  ', ' '), '  ', ' '), '  ', ' '))) = ?
       LIMIT 1`,
      [normalizedName, normalizedName]
    );
    if (duplicateBusiness) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_BUSINESS_NAME",
        message: "A business with this name already exists. If this is your business, report it for review."
      });
    }

    const selectedPlan = normalizeProviderPlan(selected_plan || plan);
    if (selected_plan || plan) {
      if (!isValidProviderPlan(selectedPlan)) {
        return res.status(402).json({
          success: false,
          message: "Please choose a plan before creating your business."
        });
      }
    }
    const selectedPlanConfig = getSubscriptionTierConfig(selectedPlan || "PRO");
    if (Number(selectedPlanConfig.photoLimit) > -1 && normalizedPortfolio.length > Number(selectedPlanConfig.photoLimit)) {
      throw validationError(`You have reached the ${selectedPlanConfig.name} limit of ${selectedPlanConfig.photoLimit} photos. Upgrade to add more.`);
    }

    const ownerProfile = await get(
      `SELECT id, email, phone, normalized_email, normalized_phone, trial_used, subscription_status
       FROM profiles
       WHERE user_id = ?`,
      [req.user.id]
    );
    const profileEmail = normalizeIdentityEmail(ownerProfile?.email);
    const profilePhone = normalizeIdentityPhone(ownerProfile?.phone);
    await run(
      `UPDATE profiles
       SET normalized_email = ?,
           normalized_phone = ?,
           selected_plan = COALESCE(?, selected_plan)
       WHERE user_id = ?`,
      [profileEmail, profilePhone, selectedPlan || null, req.user.id]
    ).catch(() => {});

    const draftStatus = "pending_subscription";
    const insertResult = await run(
      `INSERT INTO barbers
       (owner_user_id, business_name, normalized_business_name, location, latitude, longitude, price_from, image, accepts_wallet, accepts_cash, stand_type, business_type, home_service_enabled, intro_text, portfolio_json, verified_status, subscription_tier, selected_plan, subscription_status, subscription_expires_at, business_status, is_published, trial_plan, trial_started_at, trial_ends_at, trial_status, used_trials)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        business_name,
        normalizedName,
        location,
        latitude,
        longitude,
        price_from,
        image || null,
        accepts_wallet ? 1 : 0,
        1,
        normalizedStandType,
        normalizedBusinessType,
        home_service_enabled ? 1 : 0,
        String(intro_text || "").trim(),
        JSON.stringify(normalizedPortfolio),
        selectedPlan || "NONE",
        selectedPlan || null,
        "none",
        null,
        draftStatus,
        0,
        null,
        null,
        null,
        null,
        JSON.stringify([]),
      ]
    );

    const barberId = insertResult.lastID;

    if (Array.isArray(services) && services.length) {
      await replaceBarberServices(barberId, services, selectedPlanConfig.serviceLimit);
    }
    await replaceTeamMembers(barberId, normalizedStandType === "shop" ? team_members : []);

    await seedDefaultWeeklySchedule(barberId);
    await updateUserRole(req.user.id, "provider");
    await logAudit(req.user.id, `Registered provider profile #${barberId}`);

    const barber = await getBarberByOwnerUserId(req.user.id);
    const barberServices = await getServicesForBarber(barber.id);
    const schedule = await getScheduleForBarber(barber.id);
    const teamMembers = await getTeamMembersForBarber(barber.id);
    const latestSubscription = await getLatestSubscription(barber.id);

    return res.status(201).json({
      success: true,
      message: "Your business has been saved, but it will only go live after you start a trial or subscribe.",
      next_step: "upgrade",
      barber: {
        ...barber,
        image: barber.image || null,
        business_type: barber.business_type || normalizedBusinessType,
        home_service_enabled: Number(barber.home_service_enabled || 0),
        intro_text: barber.intro_text || "",
        portfolio: parseJsonArray(barber.portfolio_json, normalizedPortfolio),
        subscription: buildSubscriptionMetadata(barber, latestSubscription),
        services: barberServices,
        team_members: teamMembers,
        teamMembers,
        schedule
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getAllBarbers(req, res, next) {
  try {
    const now = new Date();
    await run(
      `UPDATE barbers
       SET business_status = 'pending_subscription',
           is_published = 0,
           subscription_tier = 'PRO',
           subscription_status = 'pending_subscription'
       WHERE subscription_tier IS NULL
          OR TRIM(subscription_tier) = ''
          OR UPPER(subscription_tier) = 'UNKNOWN'
          OR subscription_status IS NULL
          OR TRIM(subscription_status) = ''
          OR UPPER(subscription_status) = 'UNKNOWN'`
    );
    await run(
      `UPDATE barbers
       SET business_status = 'active'
       WHERE business_status = 'trialing'
         AND COALESCE(is_published, 0) = 1
         AND subscription_tier IN ('PRO', 'PREMIUM', 'PLATINUM')
         AND LOWER(COALESCE(subscription_status, '')) = 'trialing'
         AND LOWER(COALESCE(trial_status, '')) = 'active'
         AND trial_ends_at IS NOT NULL
         AND trial_ends_at > ?`,
      [now.toISOString()]
    );
    await run(
      `UPDATE barbers
       SET business_status = 'pending_subscription',
           is_published = 0
       WHERE COALESCE(is_published, 0) = 1
         AND (
           business_status NOT IN ('active', 'approved', 'live')
           OR COALESCE(is_demo, 0) = 1
           OR subscription_tier NOT IN ('PRO', 'PREMIUM', 'PLATINUM')
           OR LOWER(COALESCE(subscription_status, '')) IN (
             'cancelled',
             'draft',
             'expired',
             'inactive',
             'pending_subscription',
             'pending_payment',
             'payment_failed',
             'plan_required',
             'rejected',
             'suspended',
             'trial_expired',
             'subscription_expired',
             'almost_ready'
           )
           OR NOT (
             EXISTS (
               SELECT 1
               FROM barber_subscriptions public_bs
               WHERE public_bs.barber_id = barbers.id
                 AND public_bs.tier IN ('PRO', 'PREMIUM', 'PLATINUM')
                 AND LOWER(COALESCE(public_bs.status, '')) = 'active'
                 AND public_bs.expires_at IS NOT NULL
                 AND public_bs.expires_at > ?
             )
             OR (
               LOWER(COALESCE(subscription_status, '')) IN ('approved', 'manual_approved', 'admin_approved')
               OR COALESCE(admin_approved, 0) = 1
             )
             OR (
               LOWER(COALESCE(subscription_status, '')) = 'active'
               AND subscription_expires_at IS NOT NULL
               AND subscription_expires_at > ?
             )
             OR (
               LOWER(COALESCE(subscription_status, '')) = 'trialing'
               AND
               LOWER(COALESCE(trial_status, '')) = 'active'
               AND trial_ends_at IS NOT NULL
               AND trial_ends_at > ?
             )
           )
         )`,
      publicBusinessParams(now)
    );

    const rows = await all(
      `SELECT
        b.id,
        b.owner_user_id,
        b.business_name,
        b.location,
        b.latitude,
        b.longitude,
        b.price_from,
        b.verified_status,
        b.image,
        b.availability_start,
        b.availability_end,
        b.accepts_wallet,
        b.accepts_cash,
        b.stand_type,
        b.business_type,
        b.home_service_enabled,
        b.intro_text,
        b.portfolio_json,
        b.subscription_tier,
        b.subscription_status,
        b.subscription_expires_at,
        b.business_status,
        b.is_published,
        b.admin_approved,
        b.is_demo,
        b.normalized_business_name,
        b.trial_plan,
        b.trial_started_at,
        b.trial_ends_at,
        b.trial_status,
        b.used_trials,
        b.created_at,
        u.username,
        COALESCE(AVG(r.rating), 0) AS avg_rating,
        COUNT(r.id) AS total_reviews
       FROM barbers b
       JOIN users u ON u.id = b.owner_user_id
       LEFT JOIN reviews r ON r.barber_id = b.id
       WHERE ${publicBusinessWhere("b")}
       GROUP BY
        b.id,
        b.owner_user_id,
        b.business_name,
        b.location,
        b.latitude,
        b.longitude,
        b.price_from,
        b.verified_status,
        b.image,
        b.availability_start,
        b.availability_end,
        b.accepts_wallet,
        b.accepts_cash,
        b.stand_type,
        b.business_type,
        b.home_service_enabled,
        b.intro_text,
        b.portfolio_json,
        b.subscription_tier,
        b.subscription_status,
        b.subscription_expires_at,
        b.business_status,
        b.is_published,
        b.admin_approved,
        b.is_demo,
        b.normalized_business_name,
        b.trial_plan,
        b.trial_started_at,
        b.trial_ends_at,
        b.trial_status,
        b.used_trials,
        b.created_at,
        u.username
       ORDER BY b.id DESC`,
      publicBusinessParams(now)
    );

    const result = [];

    for (const barber of rows || []) {
      const services = await getServicesForBarber(barber.id);
      const teamMembers = await getTeamMembersForBarber(barber.id);
      const latestSubscription = await getLatestSubscription(barber.id);
      if (!isBusinessPubliclyVisible(barber, latestSubscription, now)) continue;
      const subscription = buildSubscriptionMetadata(barber, latestSubscription);

      const badge =
        subscription.features.topBarberBadge
          ? "top-barber"
          : barber.verified_status === "Verified"
          ? "verified"
          : Number(barber.total_reviews) >= 10 && Number(barber.avg_rating) >= 4.5
          ? "top-rated"
          : Number(barber.price_from) <= 20000
          ? "affordable"
          : "new";

      result.push({
        ...barber,
        image: barber.image || null,
        avg_rating: Number(barber.avg_rating || 0).toFixed(1),
        total_reviews: Number(barber.total_reviews || 0),
        business_type: barber.business_type || "Beauty & Grooming",
        home_service_enabled: Number(barber.home_service_enabled || 0),
        intro_text: barber.intro_text || "",
        portfolio: parseJsonArray(barber.portfolio_json, []),
        badge,
        featured: subscription.features.homepageFeatured,
        subscription,
        services,
        team_members: teamMembers,
        teamMembers
      });
    }

    res.status(200).json({
      success: true,
      barbers: result.sort((a, b) => {
        const tierDiff = getTierRank(b.subscription?.tier) - getTierRank(a.subscription?.tier);
        if (tierDiff !== 0) return tierDiff;
        const featuredDiff = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
        if (featuredDiff !== 0) return featuredDiff;
        const ratingDiff = Number(b.avg_rating || 0) - Number(a.avg_rating || 0);
        if (ratingDiff !== 0) return ratingDiff;
        const reviewDiff = Number(b.total_reviews || 0) - Number(a.total_reviews || 0);
        if (reviewDiff !== 0) return reviewDiff;
        return Number(a.price_from || 0) - Number(b.price_from || 0);
      })
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyBarberProfile(req, res, next) {
  try {
    let barber = await getBarberByOwnerUserId(req.user.id);

    if (!barber) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found."
      });
    }

    if (!normalizeProviderPlan(barber.subscription_tier) || String(barber.subscription_status || "").toUpperCase() === "UNKNOWN") {
      await run(
        `UPDATE barbers
         SET business_status = 'pending_subscription',
             is_published = 0,
             subscription_tier = 'PRO',
             subscription_status = 'pending_subscription'
         WHERE id = ?`,
        [barber.id]
      );
      barber = await getBarberByOwnerUserId(req.user.id);
    }

    const services = await getServicesForBarber(barber.id);
    const schedule = await getScheduleForBarber(barber.id);
    const teamMembers = await getTeamMembersForBarber(barber.id);
    const latestSubscription = await getLatestSubscription(barber.id);

    res.status(200).json({
      success: true,
      barber: {
        ...barber,
        image: barber.image || null,
        business_type: barber.business_type || "Beauty & Grooming",
        home_service_enabled: Number(barber.home_service_enabled || 0),
        intro_text: barber.intro_text || "",
        portfolio: parseJsonArray(barber.portfolio_json, []),
        subscription: buildSubscriptionMetadata(barber, latestSubscription),
        services,
        team_members: teamMembers,
        teamMembers,
        schedule
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function updateMyBarberProfile(req, res, next) {
  try {
    const barber = await getBarberByOwnerUserId(req.user.id);

    if (!barber) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found."
      });
    }

    const {
      business_name,
      location,
      latitude = null,
      longitude = null,
      price_from = 0,
      accepts_wallet = barber.accepts_wallet,
      accepts_cash = barber.accepts_cash,
      services = [],
      stand_type = barber.stand_type || "individual",
      team_members = [],
      business_type = barber.business_type || "Beauty & Grooming",
      home_service_enabled = barber.home_service_enabled || false,
      intro_text = barber.intro_text || "",
      portfolio = parseJsonArray(barber.portfolio_json, []),
    } = req.body;
    const normalizedStandType = normalizeStandType(stand_type);
    const normalizedBusinessType = normalizeBusinessType(business_type);
    const normalizedPortfolio = normalizePortfolioItems(portfolio);

    const incomingImage = req.body.image;
    const finalImage =
      typeof incomingImage === "string" && incomingImage.trim() !== ""
        ? incomingImage
        : barber.image || null;

    if (!business_name || !location) {
      return res.status(400).json({
        success: false,
        message: "Business name and location are required."
      });
    }

    await run(
      `UPDATE barbers
       SET business_name = ?,
           location = ?,
           latitude = ?,
           longitude = ?,
           price_from = ?,
           image = ?,
           accepts_wallet = ?,
           accepts_cash = ?,
           stand_type = ?,
           business_type = ?,
           home_service_enabled = ?,
           intro_text = ?,
           portfolio_json = ?
       WHERE owner_user_id = ?`,
      [
        business_name,
        location,
        latitude,
        longitude,
        Number(price_from || 0),
        finalImage,
        accepts_wallet ? 1 : 0,
        1,
        normalizedStandType,
        normalizedBusinessType,
        home_service_enabled ? 1 : 0,
        String(intro_text || "").trim(),
        JSON.stringify(normalizedPortfolio),
        req.user.id
      ]
    );

    if (Array.isArray(services)) {
      await replaceBarberServices(barber.id, services, planConfig.serviceLimit);
    }
    if (Array.isArray(team_members)) {
      await replaceTeamMembers(barber.id, normalizedStandType === "shop" ? team_members : []);
    }

    await logAudit(req.user.id, `Updated provider profile #${barber.id}`);

    const updatedBarber = await getBarberByOwnerUserId(req.user.id);
    const updatedServices = await getServicesForBarber(updatedBarber.id);
    const schedule = await getScheduleForBarber(updatedBarber.id);
    const teamMembers = await getTeamMembersForBarber(updatedBarber.id);
    const latestSubscription = await getLatestSubscription(updatedBarber.id);

    return res.status(200).json({
      success: true,
      message: "Provider profile updated successfully.",
      barber: {
        ...updatedBarber,
        image: updatedBarber.image || null,
        business_type: updatedBarber.business_type || normalizedBusinessType,
        home_service_enabled: Number(updatedBarber.home_service_enabled || 0),
        intro_text: updatedBarber.intro_text || "",
        portfolio: parseJsonArray(updatedBarber.portfolio_json, normalizedPortfolio),
        subscription: buildSubscriptionMetadata(updatedBarber, latestSubscription),
        services: updatedServices,
        team_members: teamMembers,
        teamMembers,
        schedule
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteMyBarberProfile(req, res, next) {
  try {
    const barber = await getBarberByOwnerUserId(req.user.id);

    if (!barber) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found."
      });
    }

    await run(
      `UPDATE barbers
       SET business_status = 'deleted',
           is_published = 0,
           deleted_at = CURRENT_TIMESTAMP
       WHERE owner_user_id = ?`,
      [req.user.id]
    );
    await run(
      `INSERT INTO subscription_events (user_id, business_id, event_type, plan_id, status, metadata)
       VALUES (?, ?, 'business_deleted', ?, 'deleted', ?)`,
      [req.user.id, barber.id, barber.subscription_tier || barber.selected_plan || null, JSON.stringify({ businessName: barber.business_name })]
    ).catch(() => {});
    await updateUserRole(req.user.id, "customer");
    await logAudit(req.user.id, `Deleted provider profile #${barber.id}`);

    return res.status(200).json({
      success: true,
      message: "Provider profile hidden successfully. Your trial history is safely preserved."
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyBarberSchedule(req, res, next) {
  try {
    const barber = await getBarberByOwnerUserId(req.user.id);

    if (!barber) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found."
      });
    }

    const schedule = await getScheduleForBarber(barber.id);

    res.status(200).json({
      success: true,
      schedule
    });
  } catch (error) {
    next(error);
  }
}

export async function updateMyBarberSchedule(req, res, next) {
  try {
    const barber = await getBarberByOwnerUserId(req.user.id);

    if (!barber) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found."
      });
    }

    const schedule = Array.isArray(req.body.schedule) ? req.body.schedule : [];

    if (!schedule.length) {
      return res.status(400).json({
        success: false,
        message: "Schedule is required."
      });
    }

    await run(`DELETE FROM barber_schedule WHERE barber_id = ?`, [barber.id]);

    for (const day of schedule) {
      await run(
        `INSERT INTO barber_schedule
         (barber_id, day_of_week, is_open, start_time, end_time, break_start, break_end)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          barber.id,
          Number(day.day_of_week),
          day.is_open ? 1 : 0,
          day.start_time || "08:00",
          day.end_time || "20:00",
          day.break_start || null,
          day.break_end || null
        ]
      );
    }

    await logAudit(req.user.id, `Updated weekly schedule for provider #${barber.id}`);

    res.status(200).json({
      success: true,
      message: "Schedule updated successfully."
    });
  } catch (error) {
    next(error);
  }
}

import db from "../config/db.js";
import {
  FREE_TRIAL_DAYS,
  getSubscriptionTierConfig,
  getTierRank,
  isValidProviderPlan,
  normalizeMoneyAmount,
  normalizeProviderPlan,
} from "../services/paymentService.js";
import {
  isBusinessPubliclyVisible,
  publicBusinessParams,
  publicBusinessWhere,
} from "../services/businessVisibility.js";
import { materializeProviderImages } from "../services/providerImageStorage.js";
import { withCanonicalProviderFields } from "../services/providerResponse.js";
import { createRequestLogger } from "../config/logger.js";
import {
  firstOwnValue,
  getClearFields,
  getStandPublishMissingDetails,
  hasAnyOwn,
  mergeDraftArray,
  mergeDraftBoolean,
  mergeDraftNumber,
  mergeDraftText,
} from "../services/standDraftMerge.js";

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

async function runInTransaction(work) {
  if (typeof db.transaction === "function") {
    return db.transaction(work);
  }
  await run("BEGIN IMMEDIATE");
  try {
    const result = await work({ run, get, all });
    await run("COMMIT");
    return result;
  } catch (error) {
    await run("ROLLBACK").catch(() => {});
    throw error;
  }
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
      b.pricing_mode,
      b.requires_quote,
      b.verified_status,
      b.verification_document_name,
      b.verification_document_url,
      b.verification_notes,
      b.verification_submitted_at,
      b.verification_reviewed_at,
      b.verification_reviewed_by,
      b.image,
      b.availability_start,
      b.availability_end,
      b.accepts_wallet,
      b.accepts_cash,
      b.stand_type,
      b.business_type,
      b.map_icon_type,
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
      u.username,
      p.phone
     FROM barbers b
     JOIN users u ON u.id = b.owner_user_id
     LEFT JOIN profiles p ON p.user_id = b.owner_user_id
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
  return normalized || "Services";
}

function normalizeMapIconType(value, fallback = "") {
  const normalized = String(value || fallback || "").trim().toLowerCase();
  return normalized
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeBusinessName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function validateImageReference(value, fieldName = "image") {
  const image = String(value || "").trim();
  if (!image) return "";

  if (/^data:image\/(png|jpe?g|webp);base64,/i.test(image)) {
    return image;
  }

  if (/^https?:\/\//i.test(image) || image.startsWith("/")) {
    if (/javascript:|<|>/i.test(image) || image.length > 2048) {
      throw validationError(`${fieldName} must be a safe image URL.`);
    }
    return image;
  }

  throw validationError(`${fieldName} must be a PNG, JPG, WebP data image, or a safe image URL.`);
}

function getImageReferenceBytes(value = "") {
  const image = String(value || "").trim();
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(image)) return 0;
  const base64 = image.split(",", 2)[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

function addImageUsage(stats, value, fieldName) {
  const image = validateImageReference(value, fieldName);
  if (!image) return stats;
  stats.count += 1;
  stats.bytes += getImageReferenceBytes(image);
  return stats;
}

function getPlanImageLimitCopy(planConfig, reason = "count") {
  const name = planConfig.name || "Your plan";
  const maxImages = Number(planConfig.photoLimit || 0);
  const totalMb = Number(planConfig.imageUploadLimitMb || maxImages * 10 || 0);
  if (reason === "logo_count" || reason === "logo_size") return "Business logo: 1 image, up to 10MB.";
  if (reason === "service_size") return "Service image must be 10MB or less.";
  if (reason === "portfolio_size") return `${name} plan allows portfolio photos up to ${totalMb}MB total.`;
  if (reason === "service_count") return "Each service can have one image.";
  return `${name} plan allows up to ${maxImages} portfolio photos.`;
}

function assertProviderImageLimits({ planConfig, businessImage = "", services = [], portfolio = [], teamMembers = [] }) {
  const stats = {
    logo: { count: 0, bytes: 0 },
    service: { count: 0, bytes: 0 },
    portfolio: { count: 0, bytes: 0 },
  };
  addImageUsage(stats.logo, businessImage, "Business image");
  for (const service of Array.isArray(services) ? services : []) {
    const serviceImageRefs = [
      service?.image || service?.service_image || "",
      ...(Array.isArray(service?.images) ? service.images : []),
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const uniqueServiceImages = [...new Set(serviceImageRefs)];
    if (uniqueServiceImages.length > 1) {
      throw validationError("Each service can have one image.");
    }
    const beforeBytes = stats.service.bytes;
    addImageUsage(stats.service, uniqueServiceImages[0] || "", "Service image");
    if (stats.service.bytes - beforeBytes > 10 * 1024 * 1024) {
      throw validationError(getPlanImageLimitCopy(planConfig, "service_size"));
    }
  }
  for (const item of Array.isArray(portfolio) ? portfolio : []) {
    addImageUsage(stats.portfolio, item?.beforeImage || item?.before_image || "", "Portfolio before image");
    addImageUsage(stats.portfolio, item?.afterImage || item?.after_image || item?.image || "", "Portfolio image");
  }
  for (const member of Array.isArray(teamMembers) ? teamMembers : []) {
    addImageUsage(stats.service, member?.image || "", "Team member image");
  }

  const maxImages = Number(planConfig.photoLimit || 0);
  const maxBytes = Number(planConfig.imageUploadLimitMb || maxImages * 10) * 1024 * 1024;
  const logoMaxBytes = 10 * 1024 * 1024;
  if (stats.logo.count > 1) {
    throw validationError(getPlanImageLimitCopy(planConfig, "logo_count"));
  }
  if (stats.logo.bytes > logoMaxBytes) {
    throw validationError(getPlanImageLimitCopy(planConfig, "logo_size"));
  }
  if (maxImages > -1 && stats.portfolio.count > maxImages) {
    throw validationError(getPlanImageLimitCopy(planConfig, "portfolio_count"));
  }
  if (maxBytes > 0 && stats.portfolio.bytes > maxBytes) {
    throw validationError(getPlanImageLimitCopy(planConfig, "portfolio_size"));
  }
  return stats;
}

function normalizeVerificationDocumentName(value) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  if (normalized.length > 120 || /[<>]/.test(normalized)) {
    throw validationError("Verification document reference must be 120 characters or fewer and cannot contain HTML.");
  }
  return normalized;
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

function withEditableDraftFields(barber = {}) {
  const businessName = String(barber.business_name || "");
  const location = String(barber.location || "");
  return {
    ...barber,
    business_name: /^Business stand draft \d+$/i.test(businessName) ? "" : businessName,
    location: location === "Location not set" ? "" : location,
  };
}

function normalizePortfolioItems(input = []) {
  return parseJsonArray(input, [])
    .map((item, index) => ({
      id: item?.id || `portfolio-${index}`,
      title: String(item?.title || item?.label || "Transformation").trim(),
      service: String(item?.service || "").trim(),
      beforeImage: validateImageReference(item?.beforeImage || item?.before_image || "", "Portfolio before image"),
      afterImage: validateImageReference(item?.afterImage || item?.after_image || "", "Portfolio after image"),
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
        image: validateImageReference(item?.image || "", "Team member image"),
        specialties: Array.isArray(item?.specialties)
          ? item.specialties.join(", ")
          : String(item?.specialties || "").trim(),
        is_active: item?.is_active === false ? 0 : 1,
      };
    })
    .filter((item) => item.name);
}

function seedDefaultWeeklySchedule(barberId, startTime = "08:00", endTime = "20:00") {
  const normalizedStart = normalizeScheduleTime(startTime, "08:00");
  const normalizedEnd = normalizeScheduleTime(endTime, "20:00");
  if (normalizedStart >= normalizedEnd) {
    throw validationError("Closing time must be later than opening time.");
  }
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
        normalizedStart,
        normalizedEnd,
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

function normalizeScheduleTime(value, fallback = null) {
  const normalized = String(value || fallback || "").trim();
  if (!normalized) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
    throw validationError("Schedule times must use HH:MM format.");
  }
  return normalized;
}

function normalizeScheduleRows(schedule = []) {
  const seenDays = new Set();
  return schedule.map((day) => {
    const dayOfWeek = Number(day.day_of_week ?? day.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw validationError("Schedule day must be between 0 and 6.");
    }
    if (seenDays.has(dayOfWeek)) {
      throw validationError("Schedule can only include each day once.");
    }
    seenDays.add(dayOfWeek);

    const isOpen = day.is_open === true || day.isOpen === true || Number(day.is_open ?? day.isOpen ?? 0) === 1;
    const startTime = normalizeScheduleTime(day.start_time ?? day.startTime, "08:00");
    const endTime = normalizeScheduleTime(day.end_time ?? day.endTime, "20:00");
    const breakStart = normalizeScheduleTime(day.break_start ?? day.breakStart, null);
    const breakEnd = normalizeScheduleTime(day.break_end ?? day.breakEnd, null);

    if (isOpen && endTime <= startTime) {
      throw validationError("Schedule end time must be after start time.");
    }
    if ((breakStart && !breakEnd) || (!breakStart && breakEnd)) {
      throw validationError("Schedule breaks require both start and end times.");
    }
    if (breakStart && breakEnd && (breakEnd <= breakStart || breakStart < startTime || breakEnd > endTime)) {
      throw validationError("Schedule break must be inside working hours.");
    }

    return {
      dayOfWeek,
      isOpen,
      startTime,
      endTime,
      breakStart,
      breakEnd,
    };
  });
}

function isVerificationApprovedStatus(value) {
  return ["approved", "verified", "complete", "completed"].includes(String(value || "").trim().toLowerCase());
}

function getDraftSavedMessage({ verificationRequired = false, planRequired = false, paymentPending = false } = {}) {
  if (paymentPending) return "Your business stand draft has been saved. Your paid plan will activate after payment confirmation.";
  if (verificationRequired && planRequired) {
    return "Your business stand draft has been saved. Verification and plan activation are still required before it becomes visible to customers.";
  }
  if (verificationRequired) {
    return "Your business stand draft has been saved. Verification is still required before it becomes visible to customers.";
  }
  if (planRequired) {
    return "Your business stand draft has been saved. Choose a plan to make it visible to customers.";
  }
  return "Business stand draft saved successfully.";
}

function normalizeOptionalMoneyAmount(value, fieldName) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw validationError(`${fieldName} cannot be negative.`);
  }
  if (amount === 0) return 0;
  try {
    return normalizeMoneyAmount(amount, fieldName);
  } catch (error) {
    throw validationError(error.message);
  }
}

function normalizeIdentityEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeIdentityPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

async function replaceBarberServices(barberId, services = [], serviceLimit = -1, { strict = true, executor = { run } } = {}) {
  const limit = Number(serviceLimit);
  if (limit > -1 && services.length > limit) {
    throw validationError(`You have reached the ${limit} service limit for your plan. Upgrade to add more.`);
  }
  const seenServices = new Set();
  for (const service of services) {
    const serviceName = String(service.service_name || service.serviceName || "").trim();
    const category = String(service.category || service.service_category || service.serviceCategory || "General").trim();
    if (strict && !serviceName) {
      throw validationError("Service name is required.");
    }
    if (!serviceName) continue;
    const duplicateKey = `${serviceName.toLowerCase()}::${category.toLowerCase()}`;
    if (seenServices.has(duplicateKey)) {
      throw validationError(`Duplicate service "${serviceName}" in ${category}. Remove the duplicate before saving.`);
    }
    seenServices.add(duplicateKey);
  }
  await executor.run(`DELETE FROM barber_services WHERE barber_id = ?`, [barberId]);

  for (const service of services) {
    const serviceName = String(service.service_name || service.serviceName || "").trim();
    const category = String(service.category || service.service_category || service.serviceCategory || "General").trim();
    const pricingType = String(service.pricing_type || service.pricingType || "fixed").trim().toLowerCase();
    const normalizedPricingType = ["fixed", "range", "starting_from", "quote"].includes(pricingType) ? pricingType : "fixed";
    const price = normalizeOptionalMoneyAmount(service.price_extra ?? service.price ?? 0, "Service price");
    const minPrice = normalizeOptionalMoneyAmount(service.min_price ?? service.minPrice ?? 0, "Minimum service price");
    const maxPrice = normalizeOptionalMoneyAmount(service.max_price ?? service.maxPrice ?? 0, "Maximum service price");
    const startingPrice = normalizeOptionalMoneyAmount(service.starting_price ?? service.startingPrice ?? 0, "Starting service price");
    const rawDuration = service.duration_minutes ?? service.durationMinutes;
    const durationMinutes = rawDuration === undefined || rawDuration === null || rawDuration === ""
      ? 0
      : Number(rawDuration);
    const rawLocationType = String(service.location_type || service.locationType || "provider_location").trim().toLowerCase();
    const locationType = ["provider_location", "customer_location"].includes(rawLocationType)
      ? rawLocationType
      : "provider_location";

    if (strict && normalizedPricingType === "fixed" && price <= 0) {
      throw validationError("Please enter a valid price.");
    }
    if (strict && normalizedPricingType === "range") {
      if (minPrice <= 0 || maxPrice <= 0) throw validationError("Please complete the price range before saving.");
      if (maxPrice <= minPrice) throw validationError("Maximum price must be greater than minimum price.");
    }
    if (strict && normalizedPricingType === "starting_from" && startingPrice <= 0) {
      throw validationError("Please enter a valid price.");
    }
    if (!Number.isFinite(durationMinutes) || (strict && durationMinutes !== 0 && (durationMinutes < 5 || durationMinutes > 1440))) {
      throw validationError("Service duration must be between 5 minutes and 24 hours.");
    }

    await executor.run(
      `INSERT INTO barber_services
       (barber_id, service_name, category, price_extra, pricing_type, min_price, max_price, starting_price, duration_minutes, location_type, description, is_available, image, is_featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        barberId,
        serviceName,
        category,
        normalizedPricingType === "fixed" ? price : 0,
        normalizedPricingType,
        normalizedPricingType === "range" ? minPrice : null,
        normalizedPricingType === "range" ? maxPrice : null,
        normalizedPricingType === "starting_from" ? startingPrice : null,
        durationMinutes,
        locationType,
        service.description || "",
        service.is_available === false || Number(service.is_available) === 0 ? 0 : 1,
        validateImageReference(service.image || service.service_image || "", "Service image"),
        service.is_featured ? 1 : 0,
      ]
    );
  }
}

async function replaceTeamMembers(barberId, teamMembers = [], { executor = { run } } = {}) {
  await executor.run(`DELETE FROM barber_team_members WHERE barber_id = ?`, [barberId]);

  for (const member of normalizeTeamMembers(teamMembers)) {
    await executor.run(
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
        supportLevel: "Choose a provider plan to activate your business.",
        serviceLimit: 0,
        photoLimit: 0,
        imageUploadLimitMb: 0,
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
      imageUploadLimitMb: tierConfig.imageUploadLimitMb,
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
  const requestLogger = createRequestLogger(req);
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
      business_type = "Services",
      map_icon_type = "",
      home_service_enabled = false,
      intro_text = "",
      portfolio = [],
      document_name = "",
      documentName = "",
      verification_document_name = "",
      selected_plan,
      plan,
      submit_intent = "draft",
      phone = "",
      schedule_start = "08:00",
      schedule_end = "20:00",
    } = req.body;
    const requestedImage = image || req.body.cover_image || req.body.coverImage || req.body.profile_image || req.body.profileImage || "";
    const requestedBusinessType = req.body.category || business_type;
    const requestedIntroText = req.body.description || intro_text;
    const requestedPortfolio = req.body.gallery_images || req.body.galleryImages || portfolio;
    const normalizedStandType = normalizeStandType(stand_type);
    const normalizedBusinessType = normalizeBusinessType(requestedBusinessType);
    const normalizedMapIconType = normalizeMapIconType(map_icon_type);
    const normalizedPortfolio = normalizePortfolioItems(
      Array.isArray(requestedPortfolio)
        ? requestedPortfolio.map((item) => typeof item === "string" ? { afterImage: item } : item)
        : requestedPortfolio
    );
    const normalizedTeamMembers = normalizedStandType === "shop" ? normalizeTeamMembers(team_members) : [];
    const normalizedVerificationDocumentName = normalizeVerificationDocumentName(
      verification_document_name || document_name || documentName
    );
    const verificationStatus = normalizedVerificationDocumentName ? "Pending verification" : "New";
    const verificationApproved = isVerificationApprovedStatus(verificationStatus);
    const verificationSubmittedAt = normalizedVerificationDocumentName ? new Date().toISOString() : null;
    const planConfig = getSubscriptionTierConfig(selected_plan || plan || "FREE");
    assertProviderImageLimits({
      planConfig,
      businessImage: requestedImage,
      services: Array.isArray(services) ? services : [],
      portfolio: normalizedPortfolio,
      teamMembers: normalizedTeamMembers,
    });
    const wantsPayment = String(submit_intent || "").trim().toLowerCase() === "payment";
    const safeBusinessName = String(business_name || "").trim() || `Business stand draft ${req.user.id}`;
    const safeLocation = String(location || "").trim() || "Location not set";
    const safePhone = String(phone || "").trim();
    const safeScheduleStart = normalizeScheduleTime(schedule_start, "08:00");
    const safeScheduleEnd = normalizeScheduleTime(schedule_end, "20:00");
    if (safeScheduleStart >= safeScheduleEnd) {
      return res.status(400).json({ success: false, message: "Closing time must be later than opening time." });
    }
    const normalizedName = normalizeBusinessName(safeBusinessName);

    if (wantsPayment && (!business_name || !location)) {
      return res.status(400).json({
        success: false,
        message: "Business name and location are required."
      });
    }

    const existing = await getBarberByOwnerUserId(req.user.id);
    if (existing) {
      const existingDeleted = String(existing.business_status || "").toLowerCase() === "deleted";
      if (!existingDeleted) {
        return res.status(409).json({
          success: false,
          code: "PROVIDER_PROFILE_EXISTS",
          message: "You already have a provider profile."
        });
      }
      await run(`DELETE FROM barber_services WHERE barber_id = ?`, [existing.id]).catch(() => {});
      await run(`DELETE FROM barber_schedule WHERE barber_id = ?`, [existing.id]).catch(() => {});
      await run(`DELETE FROM barber_team_members WHERE barber_id = ?`, [existing.id]).catch(() => {});
      await run(`DELETE FROM barbers WHERE id = ? AND owner_user_id = ? AND LOWER(COALESCE(business_status, '')) = 'deleted'`, [existing.id, req.user.id]);
    }

    const duplicateBusiness = business_name ? await get(
      `SELECT id FROM barbers
       WHERE (
            normalized_business_name = ?
            OR LOWER(TRIM(REPLACE(REPLACE(REPLACE(business_name, '  ', ' '), '  ', ' '), '  ', ' '))) = ?
          )
         AND LOWER(COALESCE(business_status, '')) <> 'deleted'
       LIMIT 1`,
      [normalizedName, normalizedName]
    ) : null;
    if (duplicateBusiness) {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_BUSINESS_NAME",
        message: "A business with this name already exists. If this is your business, please contact support or report ownership."
      });
    }

    const selectedPlan = wantsPayment ? normalizeProviderPlan(selected_plan || plan) : "";
    const freeActivation = wantsPayment && selectedPlan === "FREE";
    if (selected_plan || plan) {
      if (!isValidProviderPlan(selectedPlan)) {
        return res.status(402).json({
          success: false,
          message: "Please choose a plan before creating your business."
        });
      }
    }
    const selectedPlanConfig = getSubscriptionTierConfig(selectedPlan || "FREE");
    assertProviderImageLimits({
      planConfig: selectedPlanConfig,
      businessImage: requestedImage,
      services: Array.isArray(services) ? services : [],
      portfolio: normalizedPortfolio,
      teamMembers: normalizedTeamMembers,
    });

    const storedImages = await materializeProviderImages({
      ownerId: req.user.id,
      businessImage: requestedImage,
      services: Array.isArray(services) ? services : [],
      portfolio: normalizedPortfolio,
      teamMembers: normalizedTeamMembers,
    });

    const ownerProfile = await get(
      `SELECT id, email, phone, normalized_email, normalized_phone, trial_used, subscription_status
       FROM profiles
       WHERE user_id = ?`,
      [req.user.id]
    );
    const profileEmail = normalizeIdentityEmail(ownerProfile?.email);
    const nextProfilePhone = safePhone || ownerProfile?.phone || "";
    const profilePhone = normalizeIdentityPhone(nextProfilePhone);
    await run(
      `UPDATE profiles
       SET phone = ?,
           normalized_email = ?,
           normalized_phone = ?,
           selected_plan = COALESCE(?, selected_plan)
       WHERE user_id = ?`,
      [nextProfilePhone, profileEmail, profilePhone, wantsPayment ? selectedPlan || null : null, req.user.id]
    ).catch(() => {});

    const draftStatus = freeActivation ? "active" : wantsPayment ? "pending_payment" : "draft";
    const subscriptionStatus = freeActivation ? "active" : wantsPayment ? "pending_payment" : "none";
    const insertResult = await run(
      `INSERT INTO barbers
       (owner_user_id, business_name, normalized_business_name, location, latitude, longitude, price_from, pricing_mode, requires_quote, image, accepts_wallet, accepts_cash, stand_type, business_type, map_icon_type, home_service_enabled, intro_text, portfolio_json, verified_status, verification_document_name, verification_submitted_at, subscription_tier, selected_plan, subscription_status, subscription_expires_at, business_status, is_published, trial_plan, trial_started_at, trial_ends_at, trial_status, used_trials, review_status, is_verified, is_suspended, is_banned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        safeBusinessName,
        normalizedName,
        safeLocation,
        latitude,
        longitude,
        normalizeOptionalMoneyAmount(price_from, "Base service price"),
        String(req.body.pricing_mode || (req.body.requires_quote ? "quote" : "fixed")).toLowerCase(),
        req.body.requires_quote ? 1 : 0,
        storedImages.businessImage || null,
        accepts_wallet ? 1 : 0,
        1,
        normalizedStandType,
        normalizedBusinessType,
        normalizedMapIconType,
        home_service_enabled ? 1 : 0,
        String(requestedIntroText || "").trim(),
        JSON.stringify(storedImages.portfolio),
        verificationStatus,
        normalizedVerificationDocumentName,
        verificationSubmittedAt,
        selectedPlan || null,
        selectedPlan || null,
        subscriptionStatus,
        null,
        draftStatus,
        freeActivation ? 1 : 0,
        null,
        null,
        null,
        null,
        JSON.stringify([]),
        "pending_review",
        0,
        0,
        0,
      ]
    );

    const barberId = insertResult.lastID;
    await run(
      `UPDATE barbers
       SET availability_start = ?,
           availability_end = ?
       WHERE id = ?`,
      [safeScheduleStart, safeScheduleEnd, barberId]
    );

    if (freeActivation) {
      await run(
        `INSERT INTO barber_subscriptions
         (barber_id, tier, price, status, billing_cycle, amount_paid, currency, payment_status, is_active, payment_reference, provider, started_at, expires_at, activated_at)
         VALUES (?, 'FREE', 0, 'active', 'monthly', 0, 'UGX', 'free', 1, ?, 'free', CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)`,
        [barberId, `free-${barberId}-${Date.now()}`]
      );
    }

    if (storedImages.services.length) {
      await replaceBarberServices(barberId, storedImages.services, selectedPlanConfig.serviceLimit, { strict: false });
    }
    if (wantsPayment && !normalizedMapIconType) {
      return res.status(400).json({ success: false, message: "Select a map icon in Business Basics before continuing." });
    }
    await replaceTeamMembers(barberId, storedImages.teamMembers);

    await seedDefaultWeeklySchedule(barberId, safeScheduleStart, safeScheduleEnd);
    await updateUserRole(req.user.id, "provider");
    await logAudit(req.user.id, `Registered provider profile #${barberId}`);

    const barber = await getBarberByOwnerUserId(req.user.id);
    const barberServices = await getServicesForBarber(barber.id);
    const schedule = await getScheduleForBarber(barber.id);
    const teamMembers = await getTeamMembersForBarber(barber.id);
    const latestSubscription = await getLatestSubscription(barber.id);

    return res.status(201).json({
      success: true,
      message: freeActivation
        ? "Business active. Your stand is now live and visible to customers on the Free plan."
        : getDraftSavedMessage({
          verificationRequired: false,
          planRequired: !freeActivation && !wantsPayment,
          paymentPending: wantsPayment,
        }),
      next_step: freeActivation ? "active" : wantsPayment ? "payment_pending" : "draft",
      barber: {
        ...withEditableDraftFields(barber),
        ...withCanonicalProviderFields(barber, {
          services: barberServices,
          portfolio: parseJsonArray(barber.portfolio_json, storedImages.portfolio),
        }),
        business_name: withEditableDraftFields(barber).business_name,
        location: withEditableDraftFields(barber).location,
        image: barber.image || null,
        document_name: barber.verification_document_name || "",
        business_type: barber.business_type || normalizedBusinessType,
        map_icon_type: barber.map_icon_type || normalizedMapIconType,
        home_service_enabled: Number(barber.home_service_enabled || 0),
        intro_text: barber.intro_text || "",
        portfolio: parseJsonArray(barber.portfolio_json, storedImages.portfolio),
        subscription: buildSubscriptionMetadata(barber, latestSubscription),
        services: barberServices,
        team_members: teamMembers,
        teamMembers,
        schedule
      }
    });
  } catch (error) {
    requestLogger.error({
      err: error,
      ownerUserId: req.user?.id,
      providedFields: Object.keys(req.body || {}).filter((key) => !["image", "portfolio", "gallery_images", "services", "team_members"].includes(key)),
      hasImagePayload: hasAnyOwn(req.body || {}, ["image", "cover_image", "coverImage", "profile_image", "profileImage"]),
      hasServicesPayload: hasAnyOwn(req.body || {}, ["services"]),
    }, "Failed to create provider stand draft");
    next(error);
  }
}

export async function getAllBarbers(req, res, next) {
  try {
    const now = new Date();
    // Fill in missing subscription_tier / subscription_status defaults for new free accounts.
    // Do NOT touch is_published or business_status — those are controlled by the provider.
    await run(
      `UPDATE barbers
       SET subscription_tier = 'FREE',
           subscription_status = 'active'
       WHERE (subscription_tier IS NULL OR TRIM(subscription_tier) = '' OR UPPER(subscription_tier) = 'UNKNOWN')
          OR (subscription_status IS NULL OR TRIM(subscription_status) = '' OR UPPER(subscription_status) = 'UNKNOWN')`
    );
    // Recover FREE providers that were incorrectly force-unpublished by the old logic.
    // If a FREE provider's stand has a publishable status, restore is_published.
    // This is a one-time healing pass; once stands are stable it becomes a no-op.
    await run(
      `UPDATE barbers
       SET subscription_status = 'active',
           subscription_tier = 'FREE'
       WHERE COALESCE(subscription_tier, 'FREE') = 'FREE'
         AND LOWER(COALESCE(subscription_status, '')) IN ('pending_subscription', 'draft', 'almost_ready', 'inactive')
         AND business_status IN ('active', 'approved', 'live')`
    );
    // Promote active trials to active status when the trial is still running.
    await run(
      `UPDATE barbers
       SET business_status = 'active'
       WHERE business_status = 'trialing'
         AND COALESCE(is_published, 0) = 1
         AND subscription_tier IN ('FREE', 'PREMIUM', 'PLATINUM')
         AND LOWER(COALESCE(subscription_status, '')) = 'trialing'
         AND LOWER(COALESCE(trial_status, '')) = 'active'
         AND trial_ends_at IS NOT NULL
         AND trial_ends_at > ?`,
      [now.toISOString()]
    );
    // Only un-publish paid-tier stands whose subscription has truly expired.
    // FREE-tier published stands are NEVER auto-unpublished.
    await run(
      `UPDATE barbers
       SET business_status = 'pending_subscription',
           is_published = 0
       WHERE COALESCE(is_published, 0) = 1
         AND COALESCE(subscription_tier, 'FREE') NOT IN ('FREE')
         AND LOWER(COALESCE(subscription_status, '')) IN (
           'cancelled',
           'expired',
           'payment_failed',
           'rejected',
           'suspended',
           'trial_expired',
           'subscription_expired'
         )`
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
        b.pricing_mode,
        b.requires_quote,
        b.verified_status,
        b.image,
        b.availability_start,
        b.availability_end,
        b.accepts_wallet,
        b.accepts_cash,
        b.stand_type,
        b.business_type,
        b.map_icon_type,
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
       LEFT JOIN reviews r ON r.barber_id = b.id AND COALESCE(r.blocked_from_public, 0) = 0
       WHERE ${publicBusinessWhere("b")}
       GROUP BY
        b.id,
        b.owner_user_id,
        b.business_name,
        b.location,
        b.latitude,
        b.longitude,
        b.price_from,
        b.pricing_mode,
        b.requires_quote,
        b.verified_status,
        b.image,
        b.availability_start,
        b.availability_end,
        b.accepts_wallet,
        b.accepts_cash,
        b.stand_type,
        b.business_type,
        b.map_icon_type,
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

      const { owner_user_id, ...publicBarber } = barber;

      result.push({
        ...publicBarber,
        ...withCanonicalProviderFields(publicBarber, {
          services,
          portfolio: parseJsonArray(barber.portfolio_json, []),
        }),
        image: barber.image || null,
        avg_rating: Number(barber.avg_rating || 0).toFixed(1),
        total_reviews: Number(barber.total_reviews || 0),
        business_type: barber.business_type || "Services",
        map_icon_type: barber.map_icon_type || "",
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
             subscription_tier = 'FREE',
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
        ...withCanonicalProviderFields(barber, {
          services,
          portfolio: parseJsonArray(barber.portfolio_json, []),
        }),
        business_name: withEditableDraftFields(barber).business_name,
        location: withEditableDraftFields(barber).location,
        image: barber.image || null,
        document_name: barber.verification_document_name || "",
        business_type: barber.business_type || "Services",
        map_icon_type: barber.map_icon_type || "",
        home_service_enabled: Number(barber.home_service_enabled || 0),
        intro_text: barber.intro_text || "",
        portfolio: parseJsonArray(barber.portfolio_json, []),
        subscription: buildSubscriptionMetadata(barber, latestSubscription),
        services,
        team_members: teamMembers,
        teamMembers,
        schedule,
        // Verification / moderation fields
        review_status: barber.review_status || "pending_review",
        is_verified: Number(barber.is_verified || 0) === 1,
        is_suspended: Number(barber.is_suspended || 0) === 1,
        is_banned: Number(barber.is_banned || 0) === 1,
        verification_change_reason: barber.verification_change_reason || "",
        moderation_note: barber.moderation_note || "",
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function updateMyBarberProfile(req, res, next) {
  const requestLogger = createRequestLogger(req);
  try {
    const barber = await getBarberByOwnerUserId(req.user.id);

    if (!barber) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found."
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const clearFields = getClearFields(body);
    const existingServices = await getServicesForBarber(barber.id);
    const existingSchedule = await getScheduleForBarber(barber.id);
    const existingTeamMembers = await getTeamMembersForBarber(barber.id);
    const existingPortfolio = parseJsonArray(barber.portfolio_json, []);
    const nextBusinessNameInput = mergeDraftText({
      body,
      keys: ["business_name", "businessName"],
      existing: barber.business_name,
      clearFields,
      clearKey: "business_name",
    });
    const nextLocationInput = mergeDraftText({
      body,
      keys: ["location"],
      existing: barber.location,
      clearFields,
      clearKey: "location",
    });
    const nextBusinessName = nextBusinessNameInput || `Business stand draft ${req.user.id}`;
    const nextLocation = nextLocationInput || "Location not set";
    const nextLatitude = mergeDraftNumber({
      body,
      keys: ["latitude"],
      existing: barber.latitude,
      clearFields,
      clearKey: "latitude",
    });
    const nextLongitude = mergeDraftNumber({
      body,
      keys: ["longitude"],
      existing: barber.longitude,
      clearFields,
      clearKey: "longitude",
    });
    const nextPriceFrom = mergeDraftNumber({
      body,
      keys: ["price_from", "priceFrom"],
      existing: barber.price_from,
      clearFields,
      clearKey: "price_from",
    });
    const nextStandType = normalizeStandType(mergeDraftText({
      body,
      keys: ["stand_type", "standType"],
      existing: barber.stand_type || "individual",
      clearFields,
      clearKey: "stand_type",
    }));
    const nextBusinessType = normalizeBusinessType(mergeDraftText({
      body,
      keys: ["category", "business_type", "businessType"],
      existing: barber.business_type || "Services",
      clearFields,
      clearKey: "business_type",
    }));
    const nextMapIconType = normalizeMapIconType(mergeDraftText({
      body,
      keys: ["map_icon_type", "mapIconType"],
      existing: barber.map_icon_type || "",
      clearFields,
      clearKey: "map_icon_type",
    }));
    const nextIntroText = mergeDraftText({
      body,
      keys: ["description", "intro_text", "introText"],
      existing: barber.intro_text || "",
      clearFields,
      clearKey: "intro_text",
    });
    const nextPortfolioInput = mergeDraftArray({
      body,
      keys: ["gallery_images", "galleryImages", "portfolio"],
      existing: existingPortfolio,
      clearFields,
      clearKey: "portfolio",
    });
    const nextPortfolio = normalizePortfolioItems(
      nextPortfolioInput.map((item) => typeof item === "string" ? { afterImage: item } : item)
    );
    const nextServicesInput = mergeDraftArray({
      body,
      keys: ["services"],
      existing: existingServices,
      clearFields,
      clearKey: "services",
    });
    const nextTeamMembersInput = mergeDraftArray({
      body,
      keys: ["team_members", "teamMembers"],
      existing: existingTeamMembers,
      clearFields,
      clearKey: "team_members",
    });
    const nextTeamMembers = nextStandType === "shop"
      ? normalizeTeamMembers(nextTeamMembersInput)
      : existingTeamMembers;
    const servicesWereProvided = hasAnyOwn(body, ["services"]);
    const portfolioWasProvided = hasAnyOwn(body, ["gallery_images", "galleryImages", "portfolio"]);
    const teamMembersWereProvided = hasAnyOwn(body, ["team_members", "teamMembers"]);
    const imageWasProvided = hasAnyOwn(body, ["image", "cover_image", "coverImage", "profile_image", "profileImage"]);
    const incomingImage = imageWasProvided
      ? firstOwnValue(body, ["image", "cover_image", "coverImage", "profile_image", "profileImage"])
      : undefined;
    const finalImage = imageWasProvided && String(incomingImage || "").trim()
      ? validateImageReference(incomingImage, "Business image")
      : imageWasProvided && clearFields.has("image")
      ? ""
      : barber.image || "";
    const nextAcceptsWallet = mergeDraftBoolean({
      body,
      keys: ["accepts_wallet", "acceptsWallet"],
      existing: barber.accepts_wallet,
    });
    const nextAcceptsCash = mergeDraftBoolean({
      body,
      keys: ["accepts_cash", "acceptsCash"],
      existing: barber.accepts_cash,
    });
    const nextHomeServiceEnabled = mergeDraftBoolean({
      body,
      keys: ["home_service_enabled", "homeServiceEnabled"],
      existing: barber.home_service_enabled,
    });
    const nextPhone = mergeDraftText({
      body,
      keys: ["phone", "business_phone", "businessPhone"],
      existing: barber.phone || "",
      clearFields,
      clearKey: "phone",
    });
    const nextScheduleStart = normalizeScheduleTime(mergeDraftText({
      body,
      keys: ["schedule_start", "scheduleStart", "availability_start"],
      existing: barber.availability_start || existingSchedule.find((day) => Number(day.is_open) === 1)?.start_time || "08:00",
      clearFields,
      clearKey: "schedule_start",
    }), "08:00");
    const nextScheduleEnd = normalizeScheduleTime(mergeDraftText({
      body,
      keys: ["schedule_end", "scheduleEnd", "availability_end"],
      existing: barber.availability_end || existingSchedule.find((day) => Number(day.is_open) === 1)?.end_time || "20:00",
      clearFields,
      clearKey: "schedule_end",
    }), "20:00");
    if (nextScheduleStart >= nextScheduleEnd) {
      return res.status(400).json({ success: false, message: "Closing time must be later than opening time." });
    }

    const hasVerificationDocumentUpdate =
      hasAnyOwn(body, ["verification_document_name", "document_name", "documentName"]);
    const existingVerificationDocumentName = barber.verification_document_name || "";
    const nextVerificationDocumentName = hasVerificationDocumentUpdate
      ? normalizeVerificationDocumentName(mergeDraftText({
          body,
          keys: ["verification_document_name", "document_name", "documentName"],
          existing: existingVerificationDocumentName,
          clearFields,
          clearKey: "verification_document_name",
        }))
      : existingVerificationDocumentName;
    const verificationDocumentChanged = nextVerificationDocumentName !== existingVerificationDocumentName;
    const nextVerificationStatus = verificationDocumentChanged
      ? nextVerificationDocumentName
        ? "Pending verification"
        : "New"
      : barber.verified_status || "New";
    const nextVerificationSubmittedAt = verificationDocumentChanged
      ? nextVerificationDocumentName
        ? new Date().toISOString()
        : null
      : barber.verification_submitted_at || null;
    const nextVerificationReviewedAt = verificationDocumentChanged ? null : barber.verification_reviewed_at || null;
    const nextVerificationReviewedBy = verificationDocumentChanged ? null : barber.verification_reviewed_by || null;
    const nextVerificationNotes = verificationDocumentChanged ? "" : barber.verification_notes || "";

    const normalizedName = normalizeBusinessName(nextBusinessName);
    if (hasAnyOwn(body, ["business_name", "businessName"]) && nextBusinessNameInput) {
      const duplicateBusiness = await get(
        `SELECT id FROM barbers
         WHERE id <> ?
           AND (
             normalized_business_name = ?
             OR LOWER(TRIM(REPLACE(REPLACE(REPLACE(business_name, '  ', ' '), '  ', ' '), '  ', ' '))) = ?
           )
         LIMIT 1`,
        [barber.id, normalizedName, normalizedName]
      );
      if (duplicateBusiness) {
        return res.status(409).json({
          success: false,
          code: "DUPLICATE_BUSINESS_NAME",
          message: "A business with this name already exists. If this is your business, please contact support or report ownership."
        });
      }
    }

    const latestSubscriptionForLimit = await getLatestSubscription(barber.id);
    const tierForLimit =
      normalizeProviderPlan(latestSubscriptionForLimit?.tier || barber.subscription_tier || barber.selected_plan) ||
      "FREE";
    const planConfig = getSubscriptionTierConfig(tierForLimit);
    assertProviderImageLimits({
      planConfig,
      businessImage: finalImage || "",
      services: nextServicesInput,
      portfolio: nextPortfolio,
      teamMembers: nextTeamMembers,
    });

    const storedImages = await materializeProviderImages({
      ownerId: req.user.id,
      businessImage: finalImage || "",
      services: nextServicesInput,
      portfolio: nextPortfolio,
      teamMembers: nextTeamMembers,
    });

    await runInTransaction(async (tx) => {
      await tx.run(
        `UPDATE barbers
         SET business_name = ?,
             normalized_business_name = ?,
             location = ?,
             latitude = ?,
             longitude = ?,
             price_from = ?,
             pricing_mode = ?,
             requires_quote = ?,
             image = ?,
             accepts_wallet = ?,
             accepts_cash = ?,
             stand_type = ?,
             business_type = ?,
             map_icon_type = ?,
             home_service_enabled = ?,
             intro_text = ?,
             portfolio_json = ?,
             availability_start = ?,
             availability_end = ?,
             verification_document_name = ?,
             verified_status = ?,
             verification_submitted_at = ?,
             verification_reviewed_at = ?,
             verification_reviewed_by = ?,
             verification_notes = ?
         WHERE owner_user_id = ?`,
        [
          nextBusinessName,
          normalizedName,
          nextLocation,
          nextLatitude,
          nextLongitude,
          normalizeOptionalMoneyAmount(nextPriceFrom ?? 0, "Base service price"),
          String(body.pricing_mode || (body.requires_quote ? "quote" : barber.pricing_mode || "fixed")).toLowerCase(),
          body.requires_quote === undefined ? Number(barber.requires_quote || 0) : body.requires_quote ? 1 : 0,
          storedImages.businessImage || finalImage || "",
          nextAcceptsWallet ? 1 : 0,
          nextAcceptsCash ? 1 : 0,
          nextStandType,
          nextBusinessType,
          nextMapIconType,
          nextHomeServiceEnabled ? 1 : 0,
          nextIntroText,
          JSON.stringify(portfolioWasProvided ? storedImages.portfolio : existingPortfolio),
          nextScheduleStart,
          nextScheduleEnd,
          nextVerificationDocumentName,
          nextVerificationStatus,
          nextVerificationSubmittedAt,
          nextVerificationReviewedAt,
          nextVerificationReviewedBy,
          nextVerificationNotes,
          req.user.id
        ]
      );
      if (servicesWereProvided || clearFields.has("services")) {
        await replaceBarberServices(barber.id, storedImages.services, planConfig.serviceLimit, { strict: false, executor: tx });
      }
      if (teamMembersWereProvided || clearFields.has("team_members")) {
        await replaceTeamMembers(barber.id, storedImages.teamMembers, { executor: tx });
      }
      if (
        hasAnyOwn(body, ["schedule_start", "scheduleStart", "availability_start", "schedule_end", "scheduleEnd", "availability_end"])
      ) {
        const scheduleToSave = existingSchedule.length
          ? existingSchedule.map((day) => ({
              ...day,
              start_time: Number(day.is_open) === 1 ? nextScheduleStart : day.start_time,
              end_time: Number(day.is_open) === 1 ? nextScheduleEnd : day.end_time,
            }))
          : Array.from({ length: 7 }, (_, day) => ({
              day_of_week: day,
              is_open: day === 0 ? 0 : 1,
              start_time: nextScheduleStart,
              end_time: nextScheduleEnd,
              break_start: "NONE",
              break_end: null,
            }));
        await tx.run(`DELETE FROM barber_schedule WHERE barber_id = ?`, [barber.id]);
        for (const day of scheduleToSave) {
          await tx.run(
            `INSERT INTO barber_schedule
             (barber_id, day_of_week, is_open, start_time, end_time, break_start, break_end)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              barber.id,
              Number(day.day_of_week ?? day.dayOfWeek),
              Number(day.is_open ?? day.isOpen) === 1 ? 1 : 0,
              day.start_time || day.startTime || nextScheduleStart,
              day.end_time || day.endTime || nextScheduleEnd,
              day.break_start || day.breakStart || "NONE",
              day.break_end || day.breakEnd || null,
            ]
          );
        }
      }
      if (hasAnyOwn(body, ["phone", "business_phone", "businessPhone"]) || clearFields.has("phone")) {
        await tx.run(
          `UPDATE profiles SET phone = ?, normalized_phone = ? WHERE user_id = ?`,
          [nextPhone, normalizeIdentityPhone(nextPhone), req.user.id]
        );
      }
    });

    await logAudit(req.user.id, `Saved provider stand draft #${barber.id}`);

    const updatedBarber = await getBarberByOwnerUserId(req.user.id);
    const updatedServices = await getServicesForBarber(updatedBarber.id);
    const schedule = await getScheduleForBarber(updatedBarber.id);
    const teamMembers = await getTeamMembersForBarber(updatedBarber.id);
    const latestSubscription = await getLatestSubscription(updatedBarber.id);

    return res.status(200).json({
      success: true,
      message: "Draft saved. You can come back and continue anytime.",
      status: "draft_saved",
      barber: {
        ...updatedBarber,
        ...withCanonicalProviderFields(updatedBarber, {
          services: updatedServices,
          portfolio: parseJsonArray(updatedBarber.portfolio_json, storedImages.portfolio),
        }),
        business_name: withEditableDraftFields(updatedBarber).business_name,
        location: withEditableDraftFields(updatedBarber).location,
        image: updatedBarber.image || null,
        document_name: updatedBarber.verification_document_name || "",
        business_type: updatedBarber.business_type || nextBusinessType,
        map_icon_type: updatedBarber.map_icon_type || nextMapIconType,
        home_service_enabled: Number(updatedBarber.home_service_enabled || 0),
        intro_text: updatedBarber.intro_text || "",
        portfolio: parseJsonArray(updatedBarber.portfolio_json, storedImages.portfolio),
        subscription: buildSubscriptionMetadata(updatedBarber, latestSubscription),
        services: updatedServices,
        team_members: teamMembers,
        teamMembers,
        schedule
      }
    });
  } catch (error) {
    requestLogger.error({
      err: error,
      ownerUserId: req.user?.id,
      standId: req.user?.id ? (await getBarberByOwnerUserId(req.user.id).catch(() => null))?.id : null,
      providedFields: Object.keys(req.body || {}).filter((key) => !["image", "portfolio", "gallery_images", "services", "team_members"].includes(key)),
      hasImagePayload: hasAnyOwn(req.body || {}, ["image", "cover_image", "coverImage", "profile_image", "profileImage"]),
      hasServicesPayload: hasAnyOwn(req.body || {}, ["services"]),
      hasPortfolioPayload: hasAnyOwn(req.body || {}, ["portfolio", "gallery_images", "galleryImages"]),
    }, "Failed to save provider stand draft");
    next(error);
  }
}

export async function publishMyBarberStand(req, res, next) {
  try {
    const barber = await getBarberByOwnerUserId(req.user.id);
    if (!barber) {
      return res.status(404).json({ success: false, message: "Provider profile not found." });
    }
    const services = await getServicesForBarber(barber.id);
    const schedule = await getScheduleForBarber(barber.id);
    const missing = getStandPublishMissingDetails({ stand: barber, services, schedule });
    if (missing.length) {
      return res.status(400).json({
        success: false,
        code: "STAND_NOT_READY",
        missing_fields: missing,
        message: `Your draft is saved, but complete ${missing.join(", ")} before publishing.`,
      });
    }
    const currentStatus = String(barber.business_status || "").toLowerCase();
    const nextStatus = ["draft", "pending_payment", "pending_subscription", "almost_ready"].includes(currentStatus)
      ? "active"
      : currentStatus || "active";

    // Ensure subscription fields are set to valid free-plan values so the stand
    // passes public visibility checks immediately after publishing.
    const currentTier = String(barber.subscription_tier || "").trim().toUpperCase();
    const currentSubStatus = String(barber.subscription_status || "").trim().toLowerCase();
    const needsTierFix = !currentTier || currentTier === "UNKNOWN";
    const needsSubStatusFix = !currentSubStatus || ["unknown", "pending_subscription", "draft", "almost_ready"].includes(currentSubStatus);

    await run(
      `UPDATE barbers
       SET is_published = 1,
           business_status = ?,
           deleted_at = NULL,
           subscription_tier = CASE WHEN (subscription_tier IS NULL OR TRIM(subscription_tier) = '' OR UPPER(subscription_tier) = 'UNKNOWN') THEN 'FREE' ELSE subscription_tier END,
           subscription_status = CASE WHEN (subscription_status IS NULL OR TRIM(subscription_status) = '' OR UPPER(subscription_status) = 'UNKNOWN' OR LOWER(subscription_status) IN ('pending_subscription', 'draft', 'almost_ready')) THEN 'active' ELSE subscription_status END
       WHERE owner_user_id = ?`,
      [nextStatus, req.user.id]
    );
    await logAudit(req.user.id, `Published provider stand #${barber.id}`);
    const updatedBarber = await getBarberByOwnerUserId(req.user.id);
    const updatedServices = await getServicesForBarber(updatedBarber.id);
    const updatedSchedule = await getScheduleForBarber(updatedBarber.id);
    const teamMembers = await getTeamMembersForBarber(updatedBarber.id);
    const latestSubscription = await getLatestSubscription(updatedBarber.id);
    return res.status(200).json({
      success: true,
      message: "Your stand is now published and visible to customers.",
      barber: {
        ...updatedBarber,
        image: updatedBarber.image || null,
        document_name: updatedBarber.verification_document_name || "",
        business_type: updatedBarber.business_type || barber.business_type || "",
        map_icon_type: updatedBarber.map_icon_type || barber.map_icon_type || "",
        home_service_enabled: Number(updatedBarber.home_service_enabled || 0),
        intro_text: updatedBarber.intro_text || "",
        portfolio: JSON.parse(updatedBarber.portfolio_json || "[]"),
        subscription: buildSubscriptionMetadata(updatedBarber, latestSubscription),
        services: updatedServices,
        team_members: teamMembers,
        teamMembers,
        schedule: updatedSchedule,
      },
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
      message: "Provider profile hidden successfully. You can create another Free plan stand when you are ready."
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

    const schedule = Array.isArray(req.body.schedule) ? normalizeScheduleRows(req.body.schedule) : [];

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
          day.dayOfWeek,
          day.isOpen ? 1 : 0,
          day.startTime,
          day.endTime,
          day.breakStart,
          day.breakEnd
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

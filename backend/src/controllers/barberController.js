import db from "../config/db.js";
import { getSubscriptionTierConfig, getTierRank } from "../services/paymentService.js";

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
      b.subscription_tier,
      b.subscription_status,
      b.subscription_expires_at,
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
    `SELECT id, service_name, price_extra, duration_minutes
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

function normalizeTeamMembers(input = []) {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (typeof item === "string") {
        return { name: item.trim() };
      }

      return {
        name: String(item?.name || "").trim(),
        title: String(item?.title || "Barber").trim() || "Barber",
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
        null,
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

async function replaceBarberServices(barberId, services = []) {
  await run(`DELETE FROM barber_services WHERE barber_id = ?`, [barberId]);

  for (const service of services) {
    await run(
      `INSERT INTO barber_services
       (barber_id, service_name, price_extra, duration_minutes)
       VALUES (?, ?, ?, ?)`,
      [
        barberId,
        service.service_name || "",
        Number(service.price_extra || 0),
        Number(service.duration_minutes || 30),
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
        member.title || "Barber",
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
    `SELECT tier, price, status, started_at, expires_at, activated_at
     FROM barber_subscriptions
     WHERE barber_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [barberId]
  );
}

function buildSubscriptionMetadata(barber, latestSubscription) {
  const tierCode = latestSubscription?.tier || barber?.subscription_tier || "FREE";
  const tierConfig = getSubscriptionTierConfig(tierCode);

  return {
    tier: tierConfig.code,
    status: latestSubscription?.status || barber?.subscription_status || "active",
    expires_at: latestSubscription?.expires_at || barber?.subscription_expires_at || null,
    features: {
      rankingWeight: tierConfig.rankingWeight,
      analyticsLevel: tierConfig.analyticsLevel,
      homepageFeatured: tierConfig.homepageFeatured,
      searchPriority: tierConfig.searchPriority,
      topBarberBadge: tierConfig.topBarberBadge,
      promotionsEnabled: tierConfig.promotionsEnabled,
      marketingPushEnabled: tierConfig.marketingPushEnabled,
      profileCustomizationLevel: tierConfig.profileCustomizationLevel,
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
      team_members = []
    } = req.body;
    const normalizedStandType = normalizeStandType(stand_type);

    if (!business_name || !location) {
      return res.status(400).json({
        success: false,
        message: "Business name and location are required."
      });
    }

    if (!accepts_wallet && !accepts_cash) {
      return res.status(400).json({
        success: false,
        message: "At least one payment option is required."
      });
    }

    const existing = await getBarberByOwnerUserId(req.user.id);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "You already have a barber profile."
      });
    }

    const insertResult = await run(
      `INSERT INTO barbers
       (owner_user_id, business_name, location, latitude, longitude, price_from, image, accepts_wallet, accepts_cash, stand_type, verified_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New')`,
      [
        req.user.id,
        business_name,
        location,
        latitude,
        longitude,
        price_from,
        image || null,
        accepts_wallet ? 1 : 0,
        accepts_cash ? 1 : 0,
        normalizedStandType
      ]
    );

    const barberId = insertResult.lastID;

    if (Array.isArray(services) && services.length) {
      await replaceBarberServices(barberId, services);
    }
    await replaceTeamMembers(barberId, normalizedStandType === "shop" ? team_members : []);

    await seedDefaultWeeklySchedule(barberId);
    await updateUserRole(req.user.id, "barber");
    await logAudit(req.user.id, `Registered barber profile #${barberId}`);

    const barber = await getBarberByOwnerUserId(req.user.id);
    const barberServices = await getServicesForBarber(barber.id);
    const schedule = await getScheduleForBarber(barber.id);
    const teamMembers = await getTeamMembersForBarber(barber.id);
    const latestSubscription = await getLatestSubscription(barber.id);

    return res.status(201).json({
      success: true,
      message: "Barber profile created successfully.",
      barber: {
        ...barber,
        image: barber.image || null,
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
        b.subscription_tier,
        b.subscription_status,
        b.subscription_expires_at,
        b.created_at,
        u.username,
        COALESCE(AVG(r.rating), 0) AS avg_rating,
        COUNT(r.id) AS total_reviews
       FROM barbers b
       JOIN users u ON u.id = b.owner_user_id
       LEFT JOIN reviews r ON r.barber_id = b.id
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
        b.subscription_tier,
        b.subscription_status,
        b.subscription_expires_at,
        b.created_at,
        u.username
       ORDER BY b.id DESC`
    );

    const result = [];

    for (const barber of rows || []) {
      const services = await getServicesForBarber(barber.id);
      const teamMembers = await getTeamMembersForBarber(barber.id);
      const latestSubscription = await getLatestSubscription(barber.id);
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
    const barber = await getBarberByOwnerUserId(req.user.id);

    if (!barber) {
      return res.status(404).json({
        success: false,
        message: "Barber profile not found."
      });
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
        message: "Barber profile not found."
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
      team_members = []
    } = req.body;
    const normalizedStandType = normalizeStandType(stand_type);

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

    if (!accepts_wallet && !accepts_cash) {
      return res.status(400).json({
        success: false,
        message: "At least one payment option is required."
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
           stand_type = ?
       WHERE owner_user_id = ?`,
      [
        business_name,
        location,
        latitude,
        longitude,
        Number(price_from || 0),
        finalImage,
        accepts_wallet ? 1 : 0,
        accepts_cash ? 1 : 0,
        normalizedStandType,
        req.user.id
      ]
    );

    if (Array.isArray(services)) {
      await replaceBarberServices(barber.id, services);
    }
    if (Array.isArray(team_members)) {
      await replaceTeamMembers(barber.id, normalizedStandType === "shop" ? team_members : []);
    }

    await logAudit(req.user.id, `Updated barber profile #${barber.id}`);

    const updatedBarber = await getBarberByOwnerUserId(req.user.id);
    const updatedServices = await getServicesForBarber(updatedBarber.id);
    const schedule = await getScheduleForBarber(updatedBarber.id);
    const teamMembers = await getTeamMembersForBarber(updatedBarber.id);
    const latestSubscription = await getLatestSubscription(updatedBarber.id);

    return res.status(200).json({
      success: true,
      message: "Barber profile updated successfully.",
      barber: {
        ...updatedBarber,
        image: updatedBarber.image || null,
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
        message: "Barber profile not found."
      });
    }

    await run(`DELETE FROM barbers WHERE owner_user_id = ?`, [req.user.id]);
    await updateUserRole(req.user.id, "customer");
    await logAudit(req.user.id, `Deleted barber profile #${barber.id}`);

    return res.status(200).json({
      success: true,
      message: "Barber profile deleted successfully."
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
        message: "Barber profile not found."
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
        message: "Barber profile not found."
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

    await logAudit(req.user.id, `Updated weekly schedule for barber #${barber.id}`);

    res.status(200).json({
      success: true,
      message: "Schedule updated successfully."
    });
  } catch (error) {
    next(error);
  }
}

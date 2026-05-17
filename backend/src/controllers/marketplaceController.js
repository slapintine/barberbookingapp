import { all, get, run } from "../db/query.js";
import { MARKETPLACE_CATEGORIES } from "../data/marketplaceCategories.js";
import { publicBusinessParams, publicBusinessWhere } from "../services/businessVisibility.js";

function normalizeProvider(row = {}) {
  return {
    id: row.id,
    user_id: row.owner_user_id,
    business_name: row.business_name,
    category_id: row.business_type || "",
    category_name: row.business_type || "",
    description: row.intro_text || "",
    location: row.location || "",
    service_area: row.location || "",
    phone: row.phone || "",
    email: row.email || "",
    profile_image: row.image || "",
    cover_image: row.cover_image || row.image || "",
    is_verified: String(row.verified_status || "").toLowerCase() === "verified",
    subscription_plan: row.subscription_tier || "LOCKED",
    trial_status: row.subscription_status || "pending_payment",
    rating: Number(row.rating || 0),
    total_reviews: Number(row.total_reviews || 0),
    created_at: row.created_at,
  };
}

function normalizeService(row = {}) {
  return {
    id: row.id,
    provider_id: row.barber_id,
    category_id: row.category || "",
    title: row.service_name,
    description: row.description || "",
    price: Number(row.price_extra || 0),
    pricing_type: row.pricing_type || "fixed",
    min_price: row.min_price ?? null,
    max_price: row.max_price ?? null,
    starting_price: row.starting_price ?? null,
    duration_minutes: Number(row.duration_minutes || 30),
    location_type: row.location_type || "provider_location",
    images: row.image ? [row.image] : [],
    is_featured: Boolean(row.is_featured),
    is_active: Number(row.is_available ?? 1) === 1,
    created_at: row.created_at || null,
  };
}

export async function getCategories(req, res, next) {
  try {
    res.json({ success: true, categories: MARKETPLACE_CATEGORIES });
  } catch (error) {
    next(error);
  }
}

export async function getProviders(req, res, next) {
  try {
    const now = new Date();
    const rows = await all(
      `SELECT
         b.*,
         p.phone,
         p.email,
         (SELECT COALESCE(AVG(r.rating), 0) FROM reviews r WHERE r.barber_id = b.id) AS rating,
         (SELECT COUNT(*) FROM reviews r WHERE r.barber_id = b.id) AS total_reviews
       FROM barbers b
       LEFT JOIN profiles p ON p.user_id = b.owner_user_id
       WHERE ${publicBusinessWhere("b")}
       ORDER BY b.id DESC`,
      publicBusinessParams(now)
    );
    res.json({ success: true, providers: rows.map(normalizeProvider) });
  } catch (error) {
    next(error);
  }
}

export async function getServiceListings(req, res, next) {
  try {
    const now = new Date();
    const rows = await all(
      `SELECT
         s.*,
         COALESCE(s.pricing_type, 'fixed') AS pricing_type,
         COALESCE(s.location_type, 'provider_location') AS location_type,
         COALESCE(s.is_featured, 0) AS is_featured
       FROM barber_services s
       JOIN barbers b ON b.id = s.barber_id
       WHERE ${publicBusinessWhere("b")}
       ORDER BY s.id DESC`,
      publicBusinessParams(now)
    );
    res.json({ success: true, service_listings: rows.map(normalizeService) });
  } catch (error) {
    next(error);
  }
}

export async function createQuoteRequest(req, res, next) {
  try {
    const providerId = Number(req.body.provider_id || req.body.providerId);
    const serviceId = Number(req.body.service_id || req.body.serviceId || 0) || null;
    const description = String(req.body.description || "").trim();
    const budget = req.body.budget === undefined || req.body.budget === "" ? null : Number(req.body.budget);
    const preferredDate = req.body.preferred_date || req.body.preferredDate || null;
    const location = String(req.body.location || "").trim();

    if (!providerId || description.length < 8) {
      return res.status(400).json({ success: false, message: "Provider and description are required." });
    }

    const provider = await get(
      `SELECT id, owner_user_id, business_name
       FROM barbers b
       WHERE b.id = ?
         AND ${publicBusinessWhere("b")}`,
      [providerId, ...publicBusinessParams(new Date())]
    );
    if (!provider) {
      return res.status(404).json({ success: false, message: "This business is not available yet." });
    }

    const result = await run(
      `INSERT INTO quote_requests
       (customer_id, provider_id, service_id, description, budget, preferred_date, location, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [req.user.id, providerId, serviceId, description, budget, preferredDate, location]
    );

    await run(
      `INSERT INTO notifications (user_id, title, type, message, barber_id, customer_user_id, read)
       VALUES (?, 'New quote request', 'quote', ?, ?, ?, 0)`,
      [provider.owner_user_id, `A customer requested a quote for ${provider.business_name}.`, providerId, req.user.id]
    ).catch(() => {});

    res.status(201).json({
      success: true,
      quote_request: {
        id: result.lastID,
        customer_id: req.user.id,
        provider_id: providerId,
        service_id: serviceId,
        description,
        budget,
        preferred_date: preferredDate,
        location,
        status: "pending",
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyQuoteRequests(req, res, next) {
  try {
    const ownedProvider = await get(`SELECT id FROM barbers WHERE owner_user_id = ?`, [req.user.id]);
    const rows = ownedProvider
      ? await all(
          `SELECT * FROM quote_requests WHERE customer_id = ? OR provider_id = ? ORDER BY created_at DESC`,
          [req.user.id, ownedProvider.id]
        )
      : await all(`SELECT * FROM quote_requests WHERE customer_id = ? ORDER BY created_at DESC`, [req.user.id]);
    res.json({ success: true, quote_requests: rows });
  } catch (error) {
    next(error);
  }
}

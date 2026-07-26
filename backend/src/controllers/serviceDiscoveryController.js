import { all, get, run, transaction } from "../db/query.js";
import { SERVICE_DISCOVERY_CATEGORIES } from "../data/serviceCategories.js";
import { publicBusinessParams, publicBusinessWhere } from "../services/businessVisibility.js";
import { withCanonicalProviderFields } from "../services/providerResponse.js";

const SUPPORT_TOPICS = new Set([
  "Contact Support",
  "Report a Problem",
  "Booking issue",
  "Payment or refund",
  "Report provider",
  "Report customer",
  "Safety concern",
  "Account help",
  "Other",
]);

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function isReachableContact(value) {
  const contact = String(value || "").trim();
  const phoneDigits = contact.replace(/\D/g, "");
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const looksLikePhone = phoneDigits.length >= 9 && phoneDigits.length <= 15;
  return looksLikeEmail || looksLikePhone;
}

function parseJsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeProvider(row = {}, services = []) {
  const portfolio = parseJsonArray(row.portfolio_json, []);
  return withCanonicalProviderFields({
    id: row.id,
    business_name: row.business_name,
    category_id: row.business_type || "",
    category_name: row.business_type || "",
    map_icon_type: row.map_icon_type || "",
    description: row.intro_text || "",
    location: row.location || "",
    latitude: row.latitude,
    longitude: row.longitude,
    service_area: row.location || "",
    profile_image: row.image || "",
    cover_image: row.cover_image || row.image || "",
    price_from: Number(row.price_from || 0),
    pricing_mode: row.pricing_mode || "fixed",
    requires_quote: Boolean(row.requires_quote),
    is_verified: String(row.verified_status || "").toLowerCase() === "verified",
    subscription_plan: row.subscription_tier || "LOCKED",
    subscription_tier: row.subscription_tier || "",
    subscription_status: row.subscription_status || "pending_payment",
    subscription_expires_at: row.subscription_expires_at || null,
    trial_status: row.trial_status || "",
    trial_ends_at: row.trial_ends_at || null,
    business_status: row.business_status || "",
    is_published: Number(row.is_published || 0),
    admin_approved: Number(row.admin_approved || 0),
    is_demo: Number(row.is_demo || 0),
    deleted_at: row.deleted_at || null,
    rating: Number(row.rating || 0),
    total_reviews: Number(row.total_reviews || 0),
    created_at: row.created_at,
  }, { services, portfolio });
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
    duration_minutes: Number(row.duration_minutes || 0),
    location_type: row.location_type || "provider_location",
    images: row.image ? [row.image] : [],
    is_featured: Boolean(row.is_featured),
    is_active: Number(row.is_available ?? 1) === 1,
    created_at: row.created_at || null,
  };
}

export async function getCategories(req, res, next) {
  try {
    res.json({ success: true, categories: SERVICE_DISCOVERY_CATEGORIES });
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
         (SELECT COALESCE(AVG(r.rating), 0) FROM reviews r WHERE r.barber_id = b.id AND COALESCE(r.blocked_from_public, 0) = 0) AS rating,
         (SELECT COUNT(*) FROM reviews r WHERE r.barber_id = b.id AND COALESCE(r.blocked_from_public, 0) = 0) AS total_reviews
       FROM barbers b
       WHERE ${publicBusinessWhere("b")}
       ORDER BY b.id DESC`,
      publicBusinessParams(now)
    );
    const providerIds = rows.map((row) => Number(row.id)).filter(Boolean);
    const services = providerIds.length
      ? await all(
        `SELECT barber_id, image
         FROM barber_services
         WHERE barber_id IN (${providerIds.map(() => "?").join(", ")})
           AND COALESCE(is_available, 1) = 1`,
        providerIds
      )
      : [];
    const servicesByProvider = services.reduce((grouped, service) => {
      const providerId = Number(service.barber_id);
      if (!grouped.has(providerId)) grouped.set(providerId, []);
      grouped.get(providerId).push(service);
      return grouped;
    }, new Map());

    res.json({
      success: true,
      providers: rows.map((row) => normalizeProvider(row, servicesByProvider.get(Number(row.id)) || [])),
    });
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
    const idempotencyKey = String(
      req.body.idempotencyKey || req.body.idempotency_key || req.get("Idempotency-Key") || ""
    ).trim().slice(0, 120);

    if (!providerId || description.length < 8) {
      return res.status(400).json({ success: false, message: "Provider and description are required." });
    }
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
      return res.status(400).json({ success: false, message: "Budget must be a valid non-negative amount." });
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
    if (Number(provider.owner_user_id) === Number(req.user.id)) {
      return res.status(400).json({ success: false, message: "You cannot request a quote from your own business." });
    }

    const service = serviceId
      ? await get(
          `SELECT id, service_name FROM barber_services WHERE id = ? AND barber_id = ?`,
          [serviceId, providerId]
        )
      : null;
    if (serviceId && !service) {
      return res.status(400).json({ success: false, message: "Select a service offered by this provider." });
    }

    let outcome;
    try {
      outcome = await transaction(async (client) => {
      if (idempotencyKey) {
        const existing = await client.get(
          `SELECT * FROM quote_requests WHERE customer_id = ? AND idempotency_key = ? LIMIT 1`,
          [req.user.id, idempotencyKey]
        );
        if (existing) {
          const existingMessage = existing.conversation_message_id
            ? await client.get(`SELECT * FROM messages WHERE id = ?`, [existing.conversation_message_id])
            : null;
          return { quoteRequest: existing, message: existingMessage, reused: true };
        }
      }

      const quoteInsert = await client.run(
        `INSERT INTO quote_requests
         (customer_id, provider_id, service_id, description, budget, preferred_date, location, status, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [req.user.id, providerId, serviceId, description, budget, preferredDate, location, idempotencyKey]
      );
      const quoteRequestId = quoteInsert.lastID;
      const details = [
        `Quote request: ${service?.service_name || "Service"}`,
        description,
        budget !== null ? `Budget: UGX ${Math.round(budget).toLocaleString("en-US")}` : "",
        preferredDate ? `Preferred date: ${preferredDate}` : "",
        location ? `Location: ${location}` : "",
      ].filter(Boolean).join("\n");
      const messageClientId = idempotencyKey ? `quote:${idempotencyKey}` : "";
      const messageInsert = await client.run(
        `INSERT INTO messages
         (barber_id, customer_user_id, sender_user_id, text, seen, client_message_id, created_at)
         VALUES (?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)`,
        [providerId, req.user.id, req.user.id, details, messageClientId]
      );
      await client.run(
        `UPDATE quote_requests SET conversation_message_id = ? WHERE id = ?`,
        [messageInsert.lastID, quoteRequestId]
      );
      await client.run(
        `INSERT INTO notifications (user_id, title, type, message, barber_id, customer_user_id, customer_username, read)
         VALUES (?, 'New quote request', 'quote', ?, ?, ?, ?, 0)`,
        [provider.owner_user_id, `A customer requested a quote for ${provider.business_name}.`, providerId, req.user.id, req.user.username]
      );

      return {
        quoteRequest: {
          id: quoteRequestId,
          customer_id: req.user.id,
          provider_id: providerId,
          service_id: serviceId,
          description,
          budget,
          preferred_date: preferredDate,
          location,
          status: "pending",
          idempotency_key: idempotencyKey,
          conversation_message_id: messageInsert.lastID,
        },
        message: {
          id: messageInsert.lastID,
          barberId: providerId,
          barberName: provider.business_name,
          customerUserId: req.user.id,
          customerUsername: req.user.username,
          sender_user_id: req.user.id,
          sender: req.user.username,
          text: details,
          body: details,
          seen: false,
          clientMessageId: messageClientId,
          createdAt: new Date().toISOString(),
        },
        reused: false,
      };
      });
    } catch (error) {
      if (!idempotencyKey || !/unique|constraint/i.test(String(error?.message || ""))) throw error;
      const existing = await get(
        `SELECT * FROM quote_requests WHERE customer_id = ? AND idempotency_key = ? LIMIT 1`,
        [req.user.id, idempotencyKey]
      );
      if (!existing) throw error;
      const existingMessage = existing.conversation_message_id
        ? await get(`SELECT * FROM messages WHERE id = ?`, [existing.conversation_message_id])
        : null;
      outcome = { quoteRequest: existing, message: existingMessage, reused: true };
    }

    res.status(outcome.reused ? 200 : 201).json({
      success: true,
      quote_request: outcome.quoteRequest,
      message: outcome.message,
      conversation_id: `${providerId}:${req.user.username}`,
      reused: outcome.reused,
    });
  } catch (error) {
    next(error);
  }
}

export async function createSupportRequest(req, res, next) {
  try {
    const topic = cleanText(req.body.topic, 80) || "Contact Support";
    const normalizedTopic = SUPPORT_TOPICS.has(topic) ? topic : "Other";
    const name = cleanText(req.body.name || req.user?.username, 120);
    const contact = cleanText(req.body.contact, 160);
    const bookingReference = cleanText(req.body.booking_id || req.body.bookingId || req.body.booking_reference, 80);
    const message = cleanText(req.body.message, 2000);

    if (!isReachableContact(contact)) {
      return res.status(400).json({ success: false, message: "Add a valid phone number or email so support can reach you." });
    }
    if (message.length < 10) {
      return res.status(400).json({ success: false, message: "Support message must be at least 10 characters." });
    }

    const result = await run(
      `INSERT INTO support_requests
       (user_id, topic, name, contact, booking_reference, message, status)
       VALUES (?, ?, ?, ?, ?, ?, 'open')`,
      [req.user.id, normalizedTopic, name, contact, bookingReference, message]
    );

    res.status(201).json({
      success: true,
      support_request: {
        id: result.lastID,
        user_id: req.user.id,
        topic: normalizedTopic,
        name,
        contact,
        booking_reference: bookingReference,
        status: "open",
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getMySupportRequests(req, res, next) {
  try {
    const rows = await all(
      `SELECT id, topic, booking_reference, status, created_at, updated_at
       FROM support_requests
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, support_requests: rows });
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

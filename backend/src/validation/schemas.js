import Joi from "joi";

// Shared, intentionally PERMISSIVE schemas. They cap lengths, enforce types and
// enums where valid input always passes, and block obvious HTML/script injection
// in display fields — but they never make optional fields required and never
// reject values the controllers already accept. The controllers remain the
// precise validator (transitions, ownership, diff-merge, price/duration rules).

// Rejects strings that contain an HTML tag opener (`<tag`), a `javascript:` URL,
// or an inline event handler (`onerror=`). Plain punctuation like "Q&A", "a < b"
// (space after <), or "<3" is still allowed, so real names/notes are unaffected.
const INJECTION = /<\s*\/?\s*[a-zA-Z]|javascript:|on\w+\s*=/;
function safeText(max, { allowEmpty = true } = {}) {
  let s = Joi.string().max(max).pattern(INJECTION, { invert: true }).messages({
    "string.pattern.invert.base": "This field can't contain HTML or script content.",
    "string.max": `This field is too long (max ${max} characters).`,
  });
  if (allowEmpty) s = s.allow("");
  return s;
}

const id = Joi.number().integer().positive(); // accepts 5 and "5" (convert)
const optionalId = id.optional().allow(null, "");
const isoDateOnly = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
const clockTime = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);
const ugandaPhone = Joi.string().pattern(/^\+?[0-9][0-9\s-]{6,18}$/);
const planCode = Joi.string().valid("FREE", "PREMIUM", "PLATINUM");

export const schemas = {
  // ── Auth ────────────────────────────────────────────────────────────────
  register: {
    body: Joi.object({
      username: Joi.string().trim().min(3).max(32).required(),
      email: Joi.string().trim().max(254).required(),
      password: Joi.string().min(1).max(200).required(),
    }).unknown(true),
  },
  login: {
    body: Joi.object({
      username: Joi.string().trim().max(254).required(),
      password: Joi.string().max(200).required(),
    }).unknown(true),
  },

  // ── Profile ─────────────────────────────────────────────────────────────
  profileUpdate: {
    body: Joi.object({
      fullName: safeText(120),
      full_name: safeText(120),
      email: Joi.string().trim().max(254).allow(""),
      phone: ugandaPhone.allow("").optional(),
      address: safeText(240),
      profilePhoto: Joi.string().max(15_000_000).allow(""),
      profile_photo: Joi.string().max(15_000_000).allow(""),
    }).unknown(true),
  },

  // ── Stand draft save / register (DIFF-ONLY: everything optional) ─────────
  standUpsert: {
    body: Joi.object({
      submit_intent: Joi.string().valid("draft", "payment", "publish").optional(),
      business_name: safeText(120),
      businessName: safeText(120),
      location: safeText(200),
      category: safeText(80),
      business_type: safeText(80),
      businessType: safeText(80),
      map_icon_type: safeText(80),
      mapIconType: safeText(80),
      stand_type: Joi.string().max(40).allow(""),
      marketplace_mode: Joi.string().valid("service", "product", "hybrid").optional(),
      marketplaceMode: Joi.string().valid("service", "product", "hybrid").optional(),
      intro_text: safeText(5000),
      introText: safeText(5000),
      description: safeText(5000),
      phone: ugandaPhone.allow("").optional(),
      business_phone: ugandaPhone.allow("").optional(),
      schedule_start: Joi.string().max(10).allow(""),
      schedule_end: Joi.string().max(10).allow(""),
      selected_plan: planCode.optional(),
      plan: planCode.optional(),
      clear_fields: Joi.array().items(Joi.string().max(60)).max(60).optional(),
      verification_document_name: safeText(120),
      document_name: safeText(120),
      // Numbers may arrive as "" (means "not provided" to the diff-merge) — never reject that.
      latitude: Joi.alternatives(Joi.number().min(-90).max(90), Joi.string().max(40)).optional().allow(null, ""),
      longitude: Joi.alternatives(Joi.number().min(-180).max(180), Joi.string().max(40)).optional().allow(null, ""),
      price_from: Joi.alternatives(Joi.number().min(0).max(1_000_000_000), Joi.string().max(40)).optional().allow(null, ""),
      // Arrays are count-capped only; their item shapes (incl. base64 images and
      // price/duration) are validated precisely by the controller. Images and
      // gallery payloads are intentionally NOT length-checked here so the scoped
      // large-body image routes keep working.
      services: Joi.array().max(200).optional(),
      team_members: Joi.array().max(100).optional(),
      teamMembers: Joi.array().max(100).optional(),
      portfolio: Joi.array().max(200).optional(),
      gallery_images: Joi.array().max(200).optional(),
      galleryImages: Joi.array().max(200).optional(),
      cover_image_url: Joi.string().max(15_000_000).allow(""),
      coverImageUrl: Joi.string().max(15_000_000).allow(""),
      business_hours: Joi.alternatives(Joi.object(), Joi.string().max(5000)).optional(),
      business_hours_json: Joi.alternatives(Joi.object(), Joi.string().max(5000)).optional(),
      businessHours: Joi.alternatives(Joi.object(), Joi.string().max(5000)).optional(),
      delivery_available: Joi.boolean().optional(),
      deliveryAvailable: Joi.boolean().optional(),
      pickup_available: Joi.boolean().optional(),
      pickupAvailable: Joi.boolean().optional(),
      delivery_areas: Joi.alternatives(Joi.array().items(safeText(120)).max(100), Joi.string().max(5000)).optional(),
      delivery_areas_json: Joi.alternatives(Joi.array().items(safeText(120)).max(100), Joi.string().max(5000)).optional(),
      deliveryAreas: Joi.alternatives(Joi.array().items(safeText(120)).max(100), Joi.string().max(5000)).optional(),
      delivery_fee: Joi.alternatives(Joi.number().min(0).max(1_000_000_000), Joi.string().max(40)).optional().allow(null, ""),
      deliveryFee: Joi.alternatives(Joi.number().min(0).max(1_000_000_000), Joi.string().max(40)).optional().allow(null, ""),
      delivery_notes: safeText(2000),
      deliveryNotes: safeText(2000),
    }).unknown(true),
  },

  // ── Bookings (controller enforces dates/times/transitions precisely) ─────
  bookingCreate: {
    body: Joi.object({
      barber_id: id.optional(),
      barberId: id.optional(),
      service_id: optionalId,
      team_member_id: optionalId,
      booking_date: isoDateOnly.optional(),
      date: isoDateOnly.optional(),
      booking_time: clockTime.optional(),
      time: clockTime.optional(),
      booking_location_type: Joi.string().valid("provider_location", "customer_location").optional(),
      booking_address: safeText(240),
      // The booking controller serializes a structured object to booking_details_json
      // (e.g. tutor-lesson details), so accept an object as well as a plain string.
      booking_details: Joi.alternatives(Joi.object(), Joi.string().max(4000)).optional().allow(null, ""),
      payment_method: Joi.string().max(40).optional(),
    }).unknown(true),
  },
  bookingStatus: {
    params: Joi.object({ id: id.required() }).unknown(true),
    body: Joi.object({
      status: Joi.string().max(40).optional(),
    }).unknown(true),
  },

  // ── Messages ─────────────────────────────────────────────────────────────
  messageSend: {
    body: Joi.object({
      barberId: id.optional(),
      barber_id: id.optional(),
      customerUsername: Joi.string().max(64).optional(),
      text: safeText(4000, { allowEmpty: false }).required(),
      clientMessageId: Joi.string().max(120).optional().allow(""),
      client_message_id: Joi.string().max(120).optional().allow(""),
    }).unknown(true),
  },

  // ── Reviews ──────────────────────────────────────────────────────────────
  reviewCreate: {
    body: Joi.object({
      barberId: id.optional(),
      barber_id: id.optional(),
      rating: Joi.number().integer().min(1).max(5).required(),
      text: safeText(2000),
      review_text: safeText(2000),
      reason: safeText(500),
    }).unknown(true),
  },
  reviewUpdate: {
    params: Joi.object({ reviewId: id.required() }).unknown(true),
    body: Joi.object({
      rating: Joi.number().integer().min(1).max(5).optional(),
      text: safeText(2000),
      review_text: safeText(2000),
      blocked: Joi.boolean().optional(),
      blocked_from_public: Joi.boolean().optional(),
    }).unknown(true),
  },

  // ── Provider coach ───────────────────────────────────────────────────────
  coachAdvice: {
    body: Joi.object({
      businessId: optionalId,
      questionId: Joi.string().max(80).optional().allow(""),
      message: safeText(2000),
    }).unknown(true),
  },

  // ── Notifications ────────────────────────────────────────────────────────
  notificationRegister: {
    body: Joi.object({
      token: Joi.string().min(10).max(4096).required(),
      platform: Joi.string().max(40).optional().allow(""),
      browser: Joi.string().max(120).optional().allow(""),
      deviceLabel: safeText(120),
      device_label: safeText(120),
    }).unknown(true),
  },
  notificationUnregister: {
    body: Joi.object({
      token: Joi.string().min(10).max(4096).required(),
    }).unknown(true),
  },

  // ── Wallet (top-up / withdraw). Validates the money shape only — does NOT
  // enable real payments; the controllers keep their coming-soon gating. ─────
  walletAmount: {
    body: Joi.object({
      amount: Joi.number().positive().max(1_000_000_000).required(),
      method: Joi.string().max(40).optional().allow(""),
      provider: Joi.string().max(40).optional().allow(""),
      phoneNumber: ugandaPhone.allow("").optional(),
      phone_number: ugandaPhone.allow("").optional(),
      note: safeText(500),
      idempotencyKey: Joi.string().max(120).optional().allow(""),
    }).unknown(true),
  },

  // ── Admin (all admin routes are already protect + requireRole("admin");
  // these only add input shape checks. Enums kept as length-capped strings so a
  // valid status/plan the controller accepts is never rejected here.) ─────────
  adminCustomerSubscription: {
    params: Joi.object({ userId: id.required() }).unknown(true),
    body: Joi.object({
      plan: Joi.string().max(40).optional().allow(""),
      status: Joi.string().max(40).optional().allow(""),
      billingCycle: Joi.string().max(20).optional().allow(""),
      months: Joi.number().integer().min(0).max(120).optional(),
      days: Joi.number().integer().min(0).max(3660).optional(),
      expiresAt: Joi.string().max(40).optional().allow("", null),
      expires_at: Joi.string().max(40).optional().allow("", null),
      adminNotes: safeText(2000),
      admin_notes: safeText(2000),
      notes: safeText(2000),
    }).unknown(true),
  },
  adminProviderSubscription: {
    params: Joi.object({ businessId: id.required() }).unknown(true),
    body: Joi.object({
      plan: Joi.string().max(40).optional().allow(""),
      status: Joi.string().max(40).optional().allow(""),
      billingCycle: Joi.string().max(20).optional().allow(""),
      months: Joi.number().integer().min(0).max(120).optional(),
      days: Joi.number().integer().min(0).max(3660).optional(),
      expiresAt: Joi.string().max(40).optional().allow("", null),
      expires_at: Joi.string().max(40).optional().allow("", null),
      adminNotes: safeText(2000),
      admin_notes: safeText(2000),
      notes: safeText(2000),
    }).unknown(true),
  },
  adminBusinessUpdate: {
    params: Joi.object({ id: id.required() }).unknown(true),
    body: Joi.object({
      status: Joi.string().max(40).optional().allow(""),
      plan: Joi.string().max(40).optional().allow(""),
      action: Joi.string().max(40).optional().allow(""),
      reason: safeText(2000),
      notes: safeText(2000),
    }).unknown(true),
  },
  adminSupportRequestUpdate: {
    params: Joi.object({ id: id.required() }).unknown(true),
    body: Joi.object({
      status: Joi.string().max(40).optional().allow(""),
      adminNotes: safeText(2000),
      admin_notes: safeText(2000),
      notes: safeText(2000),
    }).unknown(true),
  },
  adminAnnouncement: {
    body: Joi.object({
      title: safeText(200),
      body: safeText(4000),
      message: safeText(4000),
      audience: Joi.string().max(40).optional().allow(""),
    }).unknown(true),
  },

  // ── Support / contact / quote (reject HTML/script in display + message) ────
  supportRequest: {
    body: Joi.object({
      name: safeText(120),
      contact: Joi.string().max(254).optional().allow(""),
      email: Joi.string().max(254).optional().allow(""),
      phone: ugandaPhone.allow("").optional(),
      topic: Joi.string().max(80).optional().allow(""),
      message: safeText(4000, { allowEmpty: false }).min(10).required(),
      booking_reference: Joi.string().max(120).optional().allow(""),
    }).unknown(true),
  },
  quoteRequest: {
    body: Joi.object({
      providerId: optionalId,
      provider_id: optionalId,
      serviceId: optionalId,
      service_id: optionalId,
      description: safeText(4000),
      message: safeText(4000),
      location: safeText(200),
      topic: Joi.string().max(80).optional().allow(""),
      budget: Joi.number().min(0).max(1_000_000_000).optional().allow("", null),
      preferredDate: isoDateOnly.optional().allow("", null),
      preferred_date: isoDateOnly.optional().allow("", null),
      contact: Joi.string().max(254).optional().allow(""),
    }).unknown(true),
  },

  // ── Account / password (policy 8–64; never reveal account existence —
  // controllers keep their generic messages; these only check payload shape) ─
  accountUpdate: {
    body: Joi.object({
      username: Joi.string().trim().min(3).max(32).optional().allow(""),
      currentPassword: Joi.string().max(200).optional().allow(""),
      newPassword: Joi.string().min(8).max(64).optional().allow(""),
    }).unknown(true),
  },
  passwordResetRequest: {
    body: Joi.object({
      email: Joi.string().max(254).optional().allow(""),
      destination: Joi.string().max(254).optional().allow(""),
    }).unknown(true),
  },
  passwordResetConfirm: {
    body: Joi.object({
      email: Joi.string().max(254).optional().allow(""),
      code: Joi.string().max(40).optional().allow(""),
      newPassword: Joi.string().min(8).max(64).optional().allow(""),
      password: Joi.string().min(8).max(64).optional().allow(""),
    }).unknown(true),
  },

  // ── Misc remaining write routes ────────────────────────────────────────────
  coachChat: {
    body: Joi.object({
      message: safeText(4000),
      text: safeText(4000),
      businessId: optionalId,
      questionId: Joi.string().max(80).optional().allow(""),
    }).unknown(true),
  },
  favouriteCreate: {
    body: Joi.object({
      barberId: id.optional(),
      barber_id: id.optional(),
    }).unknown(true),
  },
  favouriteDelete: {
    params: Joi.object({ barberId: id.required() }).unknown(true),
  },
  scheduleUpdate: {
    body: Joi.object({
      schedule: Joi.array().max(31).optional(),
    }).unknown(true),
  },

  // ── Admin security audit-log read (paginated + filterable) ─────────────────
  adminAuditLogQuery: {
    query: Joi.object({
      event_type: Joi.string().max(120).optional(),
      actor_user_id: Joi.number().integer().positive().optional(),
      target_type: Joi.string().max(60).optional(),
      target_id: Joi.string().max(120).optional(),
      from: isoDateOnly.optional(),
      to: isoDateOnly.optional(),
      page: Joi.number().integer().min(1).max(100000).optional(),
      pageSize: Joi.number().integer().min(1).max(100).optional(),
    }).unknown(true),
  },
};

export default schemas;

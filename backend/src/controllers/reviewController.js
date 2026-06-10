import { all, get, run } from "../db/query.js";
import { getLatestProviderSubscription, isActiveProviderPlatinum } from "../services/providerSubscriptionAccess.js";

const REVIEW_BLOCK_LIMIT = 10;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeReviewText(value) {
  return String(value ?? "").trim().slice(0, 1200);
}

function serializeReview(row = {}) {
  return {
    ...row,
    blocked_from_public: Number(row.blocked_from_public || 0),
    blockedFromPublic: Number(row.blocked_from_public || 0) === 1,
    blockedByUserId: row.blocked_by_user_id || null,
    blockedAt: row.blocked_at || null,
    blockReason: row.block_reason || "",
  };
}

async function getBookingById(bookingId) {
  return get(`SELECT * FROM bookings WHERE id = ?`, [bookingId]);
}

async function getExistingReviewByBooking(bookingId) {
  return get(`SELECT * FROM reviews WHERE booking_id = ?`, [bookingId]);
}

async function getBarberOwnerUserId(barberId) {
  const row = await get(`SELECT owner_user_id FROM barbers WHERE id = ?`, [barberId]);
  return row?.owner_user_id || null;
}

async function addNotification(userId, message) {
  await run(
    `INSERT INTO notifications (user_id, message, read)
     VALUES (?, ?, 0)`,
    [userId, message]
  );
}

async function getReviewBlockUsage(barberId) {
  const row = await get(
    `SELECT COUNT(*) AS count
     FROM reviews
     WHERE barber_id = ?
       AND COALESCE(blocked_from_public, 0) = 1`,
    [barberId]
  );
  return {
    used: Number(row?.count || 0),
    limit: REVIEW_BLOCK_LIMIT,
  };
}

async function assertCanManageProviderReviews(user, barberId) {
  const business = await get(`SELECT * FROM barbers WHERE id = ? AND deleted_at IS NULL`, [barberId]);
  if (!business) throw httpError(404, "Provider not found.");

  const role = String(user?.role || "").toLowerCase();
  const isAdmin = ["admin", "superadmin", "super_admin", "super-admin"].includes(role);
  if (!isAdmin && Number(business.owner_user_id) !== Number(user?.id)) {
    throw httpError(403, "You can only manage reviews for your own provider stand.");
  }

  const subscription = await getLatestProviderSubscription(barberId);
  if (!isAdmin && !isActiveProviderPlatinum(business, subscription)) {
    throw httpError(403, "Review blocking is available on the Platinum plan.");
  }

  return { business, isAdmin };
}

export async function createReview(req, res, next) {
  try {
    const { booking_id, rating } = req.body;
    const reviewText = normalizeReviewText(req.body.review_text ?? req.body.text);

    if (!booking_id || !rating) {
      throw httpError(400, "Booking and rating are required.");
    }

    const numericRating = Number(rating);
    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      throw httpError(400, "Rating must be between 1 and 5.");
    }

    if (!reviewText) {
      throw httpError(400, "Please add a short review before submitting.");
    }

    const booking = await getBookingById(booking_id);
    if (!booking) throw httpError(404, "Booking not found.");

    if (Number(booking.customer_user_id) !== Number(req.user.id)) {
      throw httpError(403, "You can only review your own booking.");
    }

    if (String(booking.status || "").toLowerCase() !== "completed") {
      throw httpError(400, "Only completed bookings can be reviewed.");
    }

    const existing = await getExistingReviewByBooking(booking_id);
    if (existing) throw httpError(409, "This booking has already been reviewed.");

    const insert = await run(
      `INSERT INTO reviews
       (booking_id, barber_id, user_id, rating, review_text)
       VALUES (?, ?, ?, ?, ?)`,
      [booking_id, booking.barber_id, req.user.id, numericRating, reviewText]
    );

    const barberOwnerId = await getBarberOwnerUserId(booking.barber_id);
    if (barberOwnerId) {
      await addNotification(barberOwnerId, `You received a new ${numericRating}-star review.`);
    }

    const row = await get(`SELECT * FROM reviews WHERE id = ?`, [insert.lastID]);
    res.status(201).json({
      success: true,
      message: "Review created successfully.",
      review: serializeReview(row),
    });
  } catch (error) {
    next(error);
  }
}

export async function getReviewsForBarber(req, res, next) {
  try {
    const { barberId } = req.params;
    const rows = await all(
      `SELECT
        r.*,
        u.username,
        p.full_name
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE r.barber_id = ?
         AND COALESCE(r.blocked_from_public, 0) = 0
       ORDER BY r.id DESC`,
      [barberId]
    );

    res.status(200).json({
      success: true,
      reviews: rows.map(serializeReview),
    });
  } catch (error) {
    next(error);
  }
}

export async function getManagedReviewsForBarber(req, res, next) {
  try {
    const barberId = Number(req.params.barberId);
    await assertCanManageProviderReviews(req.user, barberId);
    const rows = await all(
      `SELECT
        r.*,
        u.username,
        p.full_name,
        blocker.username AS blocked_by_username
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN users blocker ON blocker.id = r.blocked_by_user_id
       WHERE r.barber_id = ?
       ORDER BY COALESCE(r.blocked_at, r.created_at) DESC, r.id DESC`,
      [barberId]
    );
    res.status(200).json({
      success: true,
      reviews: rows.map(serializeReview),
      reviewBlockUsage: await getReviewBlockUsage(barberId),
    });
  } catch (error) {
    next(error);
  }
}

export async function setReviewPublicBlock(req, res, next) {
  try {
    const reviewId = Number(req.params.reviewId);
    const shouldBlock = Boolean(req.body.blocked ?? req.body.blocked_from_public ?? true);
    const review = await get(`SELECT * FROM reviews WHERE id = ?`, [reviewId]);
    if (!review) throw httpError(404, "Review not found.");

    await assertCanManageProviderReviews(req.user, review.barber_id);
    const usage = await getReviewBlockUsage(review.barber_id);

    if (shouldBlock && Number(review.blocked_from_public || 0) !== 1 && usage.used >= REVIEW_BLOCK_LIMIT) {
      throw httpError(409, `You have used all ${REVIEW_BLOCK_LIMIT} Platinum review blocks.`);
    }

    await run(
      `UPDATE reviews
       SET blocked_from_public = ?,
           blocked_by_user_id = ?,
           blocked_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
           block_reason = ?
       WHERE id = ?`,
      [
        shouldBlock ? 1 : 0,
        shouldBlock ? req.user.id : null,
        shouldBlock ? 1 : 0,
        shouldBlock ? normalizeReviewText(req.body.reason || "Provider public review control") : "",
        reviewId,
      ]
    );

    const updated = await get(`SELECT * FROM reviews WHERE id = ?`, [reviewId]);
    res.status(200).json({
      success: true,
      message: shouldBlock ? "Review hidden from public stand." : "Review restored to public stand.",
      review: serializeReview(updated),
      reviewBlockUsage: await getReviewBlockUsage(review.barber_id),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateReview(req, res, next) {
  try {
    const reviewId = req.params.reviewId;
    const numericRating = Number(req.body.rating);
    const reviewText = normalizeReviewText(req.body.review_text ?? req.body.text);

    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      throw httpError(400, "Rating must be between 1 and 5.");
    }

    if (!reviewText) throw httpError(400, "Please add a short review before saving.");

    const review = await get(`SELECT * FROM reviews WHERE id = ?`, [reviewId]);
    if (!review) throw httpError(404, "Review not found.");
    if (Number(review.user_id) !== Number(req.user.id)) {
      throw httpError(403, "You can only edit your own reviews.");
    }

    await run(`UPDATE reviews SET rating = ?, review_text = ? WHERE id = ?`, [numericRating, reviewText, reviewId]);
    const row = await get(`SELECT * FROM reviews WHERE id = ?`, [reviewId]);
    res.status(200).json({
      success: true,
      message: "Review updated.",
      review: serializeReview(row),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteReview(req, res, next) {
  try {
    const reviewId = req.params.reviewId;
    const review = await get(`SELECT * FROM reviews WHERE id = ?`, [reviewId]);
    if (!review) throw httpError(404, "Review not found.");
    if (Number(review.user_id) !== Number(req.user.id)) {
      throw httpError(403, "You can only delete your own reviews.");
    }

    await run(`DELETE FROM reviews WHERE id = ?`, [reviewId]);
    res.status(200).json({
      success: true,
      message: "Review deleted.",
      review: serializeReview(review),
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyReviews(req, res, next) {
  try {
    const rows = await all(
      `SELECT
        r.*,
        b.service_name,
        b.booking_date,
        b.booking_time,
        barbers.business_name
       FROM reviews r
       JOIN bookings b ON b.id = r.booking_id
       JOIN barbers ON barbers.id = r.barber_id
       WHERE r.user_id = ?
       ORDER BY r.id DESC`,
      [req.user.id]
    );
    res.status(200).json({
      success: true,
      reviews: rows.map(serializeReview),
    });
  } catch (error) {
    next(error);
  }
}

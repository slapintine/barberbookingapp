import db from "../config/db.js";

function getBookingById(bookingId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM bookings WHERE id = ?`,
      [bookingId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

function getExistingReviewByBooking(bookingId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM reviews WHERE booking_id = ?`,
      [bookingId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

function getBarberOwnerUserId(barberId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT owner_user_id FROM barbers WHERE id = ?`,
      [barberId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.owner_user_id || null);
      }
    );
  });
}

function addNotification(userId, message) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO notifications (user_id, message, read)
       VALUES (?, ?, 0)`,
      [userId, message],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

export async function createReview(req, res, next) {
  try {
    const { booking_id, rating, review_text = "" } = req.body;

    if (!booking_id || !rating) {
      return res.status(400).json({
        success: false,
        message: "Booking and rating are required."
      });
    }

    const numericRating = Number(rating);
    if (numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5."
      });
    }

    const booking = await getBookingById(booking_id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found."
      });
    }

    if (Number(booking.customer_user_id) !== Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "You can only review your own booking."
      });
    }

    if (booking.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Only completed bookings can be reviewed."
      });
    }

    const existing = await getExistingReviewByBooking(booking_id);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "This booking has already been reviewed."
      });
    }

    db.run(
      `INSERT INTO reviews
       (booking_id, barber_id, user_id, rating, review_text)
       VALUES (?, ?, ?, ?, ?)`,
      [booking_id, booking.barber_id, req.user.id, numericRating, review_text],
      async function (err) {
        if (err) return next(err);

        const barberOwnerId = await getBarberOwnerUserId(booking.barber_id);
        if (barberOwnerId) {
          await addNotification(
            barberOwnerId,
            `You received a new ${numericRating}-star review.`
          );
        }

        db.get(
          `SELECT * FROM reviews WHERE id = ?`,
          [this.lastID],
          (selectErr, row) => {
            if (selectErr) return next(selectErr);

            res.status(201).json({
              success: true,
              message: "Review created successfully.",
              review: row
            });
          }
        );
      }
    );
  } catch (error) {
    next(error);
  }
}

export function getReviewsForBarber(req, res, next) {
  const { barberId } = req.params;

  db.all(
    `SELECT
      r.*,
      u.username,
      p.full_name
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE r.barber_id = ?
     ORDER BY r.id DESC`,
    [barberId],
    (err, rows) => {
      if (err) return next(err);

      res.status(200).json({
        success: true,
        reviews: rows || []
      });
    }
  );
}

export async function updateReview(req, res, next) {
  try {
    const reviewId = req.params.reviewId;
    const numericRating = Number(req.body.rating);
    const reviewText = String(req.body.review_text ?? req.body.text ?? "").trim();

    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5."
      });
    }

    db.get(`SELECT * FROM reviews WHERE id = ?`, [reviewId], (err, review) => {
      if (err) return next(err);
      if (!review) {
        return res.status(404).json({ success: false, message: "Review not found." });
      }
      if (Number(review.user_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: "You can only edit your own reviews." });
      }

      db.run(
        `UPDATE reviews SET rating = ?, review_text = ? WHERE id = ?`,
        [numericRating, reviewText, reviewId],
        (updateErr) => {
          if (updateErr) return next(updateErr);
          db.get(`SELECT * FROM reviews WHERE id = ?`, [reviewId], (selectErr, row) => {
            if (selectErr) return next(selectErr);
            res.status(200).json({
              success: true,
              message: "Review updated.",
              review: row,
            });
          });
        }
      );
    });
  } catch (error) {
    next(error);
  }
}

export function deleteReview(req, res, next) {
  const reviewId = req.params.reviewId;

  db.get(`SELECT * FROM reviews WHERE id = ?`, [reviewId], (err, review) => {
    if (err) return next(err);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found." });
    }
    if (Number(review.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: "You can only delete your own reviews." });
    }

    db.run(`DELETE FROM reviews WHERE id = ?`, [reviewId], (deleteErr) => {
      if (deleteErr) return next(deleteErr);
      res.status(200).json({
        success: true,
        message: "Review deleted.",
        review,
      });
    });
  });
}

export function getMyReviews(req, res, next) {
  db.all(
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
    [req.user.id],
    (err, rows) => {
      if (err) return next(err);
      res.status(200).json({
        success: true,
        reviews: rows || [],
      });
    }
  );
}

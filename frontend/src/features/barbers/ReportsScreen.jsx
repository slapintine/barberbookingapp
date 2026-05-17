import { useState } from "react";
import { FiFlag, FiStar } from "react-icons/fi";

function getAverageRating(reviews = []) {
  if (!reviews.length) return 0;
  const total = reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0);
  return Number((total / reviews.length).toFixed(1));
}

export default function ReportsScreen({ barber, reviews, bookings = [] }) {
  const [reportedReviews, setReportedReviews] = useState({});

  if (!barber) {
    return (
      <div className="content-v4 standard-page-v4">
        <div className="empty-state-v7">
          <FiStar />
          <strong>No barber profile found</strong>
          <span>Create a barber stand before checking reports.</span>
        </div>
      </div>
    );
  }

  const avgRating = getAverageRating(reviews || []);
  const recentReviews = [...(reviews || [])]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 3);
  const roundedRating = Math.round(avgRating);
  const subscription = barber.subscription || {};
  const analyticsLevel = subscription.features?.analyticsLevel || "none";
  const hasAnalytics = analyticsLevel !== "none";
  const paidBookings = (bookings || []).filter(
    (item) =>
      Number(item.barberId) === Number(barber.id) &&
      String(item.paymentStatus || "").toLowerCase() === "paid"
  );
  const grossRevenue = paidBookings.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const commission = paidBookings.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0);
  const payout = paidBookings.reduce((sum, item) => sum + Number(item.barberAmount || 0), 0);

  return (
    <div className="content-v4 standard-page-v4">
      <div className="panel-title-v4">Reviews & reports</div>

      <div className="dashboard-stats-v4 dashboard-stats-v4-secondary">
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{subscription.tier || "FREE"}</div>
          <div className="stat-label-v4">Plan</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{subscription.features?.homepageFeatured ? "Featured" : "Listed"}</div>
          <div className="stat-label-v4">Visibility</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{subscription.features?.topBarberBadge ? "Active" : "Off"}</div>
          <div className="stat-label-v4">Top barber badge</div>
        </div>
      </div>

      <div className="dashboard-stats-v4 dashboard-stats-v4-secondary">
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{hasAnalytics ? paidBookings.length : "--"}</div>
          <div className="stat-label-v4">Paid bookings</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{hasAnalytics ? `UGX ${grossRevenue.toLocaleString()}` : "--"}</div>
          <div className="stat-label-v4">Gross revenue</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{analyticsLevel === "advanced" ? `UGX ${commission.toLocaleString()}` : "--"}</div>
          <div className="stat-label-v4">Commission</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{analyticsLevel === "advanced" ? `UGX ${payout.toLocaleString()}` : "--"}</div>
          <div className="stat-label-v4">Net payout</div>
        </div>
      </div>

      <div className="simple-card-v4 reports-stars-card-v4">
        <div className="reports-stars-top-v4">
          <div>
            <div className="reports-eyebrow-v4">Customer rating</div>
            <div className="reports-score-v4">{avgRating ? avgRating.toFixed(1) : "0.0"}</div>
            <div className="reports-count-v4">{(reviews || []).length} reviews</div>
          </div>
          <div className="reports-star-orbit-v4">
            <FiStar />
          </div>
        </div>

        <div className="reports-star-row-v4" aria-label={`${avgRating || 0} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((star) => (
            <FiStar key={star} className={star <= roundedRating ? "active" : ""} />
          ))}
        </div>

        {recentReviews.length === 0 ? (
          <div className="empty-state-v7 compact">
            <FiStar />
            <strong>No reviews yet</strong>
            <span>Your star report will appear after customers rate their cuts.</span>
          </div>
        ) : (
          <div className="reports-review-strip-v4">
            {recentReviews.map((review) => (
              <div key={review.id} className="profile-review-card-v4">
                <div className="profile-review-head-v4">
                  <strong>{review.name || review.username || "Customer"}</strong>
                  <span className="profile-review-rating-v4">{Number(review.rating || 0).toFixed(1)} stars</span>
                </div>
                <div className="profile-review-text-v4">{review.text || "No written review."}</div>
                <button
                  type="button"
                  className="review-report-btn-v7"
                  onClick={() => setReportedReviews((prev) => ({ ...prev, [review.id]: true }))}
                  disabled={reportedReviews[review.id]}
                >
                  <FiFlag /> {reportedReviews[review.id] ? "Reported for moderation" : "Report abuse"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

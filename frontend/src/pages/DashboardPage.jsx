import { FiAward, FiBell, FiCalendar, FiClock, FiEdit2, FiMapPin, FiScissors, FiShield, FiStar, FiTrendingUp, FiZap } from "react-icons/fi";
import { lazy } from "react";
import { getPaymentMethodLabel, isOnlinePaymentMethod } from "../utils/paymentLabels.js";
import { formatPlanName } from "../utils/subscriptionPlans.js";

const ScheduleWorkspace = lazy(() => import("../features/barbers/ScheduleWorkspace.jsx"));

export default function DashboardPage({
  barber,
  bookings,
  notifications,
  subscription,
  approveBooking,
  rejectBooking,
  completeBooking,
  confirmCashPayment,
  onOpenConversation,
  currentUser,
  onOpenManageStand,
  onOpenReports,
  onOpenAiCoach,
  onOpenUpgradePlan,
  getBookingsForCalendar,
  dateValueToDate,
  formatMoney,
  getBadgeLabel,
  formatTimeLabel,
}) {
  if (!barber) {
    return (
      <div className="content-v4 app-page-v4">
        <div className="simple-card-v4">No business profile found yet.</div>
      </div>
    );
  }

  const myBookings = getBookingsForCalendar(bookings, barber, currentUser?.username);
  const pending = myBookings.filter((item) => item.status === "pending");
  const confirmed = myBookings.filter((item) => item.status === "confirmed");
  const completed = myBookings.filter((item) => item.status === "completed");
  const cancelled = myBookings.filter((item) => item.status === "cancelled" || item.status === "rejected");
  const paidBookings = myBookings.filter((item) => item.paymentStatus === "paid");
  const completedPayments = completed.filter((item) => item.paymentStatus === "paid");
  const totalRevenue = completed.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const onlineCompleted = completed.filter((item) => isOnlinePaymentMethod(item.paymentMethod));
  const totalCommission = onlineCompleted.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0);
  const totalPayout = completed.reduce((sum, item) => {
    const price = Number(item.price || 0);
    if (!isOnlinePaymentMethod(item.paymentMethod)) return sum + price;
    return sum + Number(item.barberAmount || price * 0.9);
  }, 0);
  const expectedEarnings = paidBookings.reduce((sum, item) => {
    const price = Number(item.price || 0);
    if (!isOnlinePaymentMethod(item.paymentMethod)) return sum + price;
    return sum + Number(item.barberAmount || price * 0.9);
  }, 0);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todayBookings = myBookings.filter((booking) => (booking.dateValue || booking.date) === todayKey);
  const monthBookings = myBookings.filter((booking) => {
    const value = booking.dateValue || booking.date;
    if (!value) return false;
    const date = dateValueToDate(value);
    return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  });
  const monthRevenue = monthBookings
    .filter((item) => item.status === "completed")
    .reduce((sum, item) => sum + Number(item.price || 0), 0);
  const recentActivity = [...myBookings]
    .sort((a, b) => new Date(`${b.dateValue || b.date}T${b.time || "00:00"}`) - new Date(`${a.dateValue || a.date}T${a.time || "00:00"}`))
    .slice(0, 3);
  const thisWeekCount = myBookings.filter((booking) => {
    const value = booking.dateValue || booking.date;
    if (!value) return false;
    const diff = dateValueToDate(value).getTime() - todayStart;
    const dayDiff = diff / (24 * 60 * 60 * 1000);
    return dayDiff >= 0 && dayDiff < 7;
  }).length;
  const currentPlan = String(subscription?.tier || barber.subscription?.tier || "").toUpperCase();
  const currentPlanLabel = formatPlanName(currentPlan, "Plan pending");
  const hasValidPlan = ["PLUS", "PREMIUM", "PLATINUM"].includes(currentPlan);
  const businessStatus = String(barber.business_status || subscription?.status || barber.subscription?.status || "").toLowerCase();
  const isPublished = Boolean(barber.is_published ?? barber.isPublished ?? false);
  const isActiveBusiness = hasValidPlan && isPublished && ["active", "trialing"].includes(businessStatus);
  const planVisibilityLabel = subscription?.features?.topBarberBadge ? "Top business badge active" : subscription?.features?.visibilityLabel || "Basic visibility";
  const isPlatinum = currentPlan === "PLATINUM";
  const isPremium = currentPlan === "PREMIUM";

  if (!isActiveBusiness) {
    return (
      <div className="content-v4 app-page-v4 dashboard-page-v9">
        <div className="dashboard-hero-v4 simple-card-v4">
          <div className="dashboard-hero-copy-v4">
            <div className="panel-title-v4">Almost ready</div>
            <div className="profile-sub-v4">{barber.business_name}</div>
            <div className="profile-sub-v4">Your business is saved but not visible to customers yet.</div>
            <div className="plan-warning-card">
              <h3>Plan required</h3>
              <p>Choose a provider plan to activate your business.</p>
              <button type="button" className="mini-action-btn-v4 success" onClick={() => onOpenUpgradePlan?.("PLUS")}>Choose Plan</button>
            </div>
          </div>
          <div className="dashboard-hero-actions-v4">
            <button className="secondary-btn-v4 compact-btn-v4" onClick={onOpenManageStand}>
              <FiEdit2 /> Edit profile
            </button>
          </div>
        </div>

        <div className="simple-card-v4 dashboard-plan-card-v9">
          <div>
            <div className="panel-title-v4">Plan & visibility</div>
          <div className="profile-sub-v4">Choose a provider plan to activate your business.</div>
          </div>
          <span className="booking-badge-v4 status-pending">Draft</span>
        </div>
      </div>
    );
  }

  return (
    <div className="content-v4 app-page-v4 dashboard-page-v9">
      <div className="dashboard-hero-v4 simple-card-v4">
        <div className="dashboard-hero-copy-v4">
          <div className="panel-title-v4">Business dashboard</div>
          <div className="profile-sub-v4">{barber.business_name}</div>
          <div className="profile-sub-v4"><FiMapPin /> {barber.location}</div>
          <div className="profile-sub-v4"><FiClock /> {barber.availability?.start} - {barber.availability?.end}</div>
          {hasValidPlan ? (
            <div className="profile-sub-v4">Selected plan: {currentPlanLabel} - {planVisibilityLabel}</div>
          ) : (
            <div className="plan-warning-card">
              <h3>Plan required</h3>
              <p>Choose a provider plan to activate your business.</p>
              <button type="button" className="mini-action-btn-v4 success" onClick={() => onOpenUpgradePlan?.("PLUS")}>Choose Plan</button>
            </div>
          )}
        </div>
        <div className="dashboard-hero-actions-v4">
          <button className="secondary-btn-v4 compact-btn-v4" onClick={onOpenManageStand}>
            <FiEdit2 /> Edit profile
          </button>
          <button className="secondary-btn-v4 compact-btn-v4" onClick={onOpenReports}>
            <FiStar /> Reports
          </button>
          <button className={isPlatinum ? "primary-btn-v4 compact-btn-v4" : "secondary-btn-v4 compact-btn-v4"} onClick={isPlatinum ? onOpenAiCoach : () => onOpenUpgradePlan?.("PLATINUM")}>
            <FiZap /> {isPlatinum ? "AI Coach" : "Unlock AI"}
          </button>
        </div>
      </div>

      <div className="dashboard-stats-v4 dashboard-stats-v4-large">
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{todayBookings.length}</div>
          <div className="stat-label-v4">Today</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{paidBookings.length}</div>
          <div className="stat-label-v4">Paid bookings</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{formatMoney(expectedEarnings || monthRevenue)}</div>
          <div className="stat-label-v4">Expected earnings</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{barber.rating ? Number(barber.rating).toFixed(1) : "New"}</div>
          <div className="stat-label-v4">Rating</div>
        </div>
      </div>

      <div className="simple-card-v4 dashboard-plan-card-v9">
        <div>
          <div className="panel-title-v4">Plan & visibility</div>
          <div className="profile-sub-v4">{thisWeekCount} bookings scheduled this week - {completedPayments.length} completed payments</div>
        </div>
        <span className="booking-badge-v4 status-confirmed">{hasValidPlan ? currentPlan : "Plan required"}</span>
      </div>

      <div className={`dashboard-plan-experience-v15 ${isPlatinum ? "platinum" : isPremium ? "premium" : "plus"}`}>
        <div className="simple-card-v4 dashboard-plan-feature-v15">
          <FiTrendingUp />
          <strong>{isPlatinum ? "Advanced analytics active" : isPremium ? "Booking analytics active" : "Basic reports"}</strong>
          <span>{isPlatinum ? "Profile views, retention, visibility, and growth prompts are unlocked." : isPremium ? "Track service performance, promotions, and repeat customers." : "Track bookings, earnings, completed jobs, and rating."}</span>
        </div>
        <div className="simple-card-v4 dashboard-plan-feature-v15">
          {isPlatinum ? <FiShield /> : isPremium ? <FiAward /> : <FiStar />}
          <strong>{isPlatinum ? "Verified Top Provider" : isPremium ? "Recommended growth plan" : "Basic visibility"}</strong>
          <span>{isPlatinum ? "Eligible for homepage, map, category, and top search placement." : isPremium ? "Better ranking than Plus with promotions and home service." : "Upgrade for promotions, badges, and stronger ranking."}</span>
        </div>
        <div className="simple-card-v4 dashboard-plan-feature-v15">
          <FiZap />
          <strong>{isPlatinum ? "AI Business Coach" : isPremium ? "Platinum AI locked" : "Growth tools locked"}</strong>
          <span>{isPlatinum ? "Get weekly suggestions based on bookings, reviews, earnings, and visibility." : "Upgrade to Platinum for AI review summaries, promotion captions, and weekly growth reports."}</span>
          <button type="button" className={isPlatinum ? "mini-action-btn-v4 success" : "mini-action-btn-v4"} onClick={isPlatinum ? onOpenAiCoach : () => onOpenUpgradePlan?.("PLATINUM")}>
            {isPlatinum ? "Open AI Coach" : "Upgrade to Platinum"}
          </button>
        </div>
      </div>

      <ScheduleWorkspace
        barber={barber}
        bookings={myBookings}
        pendingCount={pending.length}
        confirmedCount={confirmed.length}
        completedCount={completed.length}
        onApproveBooking={approveBooking}
        onRejectBooking={rejectBooking}
        onCompleteBooking={completeBooking}
        onOpenConversation={onOpenConversation}
      />

      <div className="simple-card-v4">
        <div className="panel-title-v4">Recent alerts</div>
        {notifications.length === 0 ? (
          <div className="profile-sub-v4">No alerts yet.</div>
        ) : (
          notifications.slice(0, 4).map((item) => (
            <div key={item.id} className="booking-meta-v4">
              <FiBell /> {(item.title || "Notification")} - {(item.description || item.message || "")}
            </div>
          ))
        )}
      </div>

      <div className="panel-head-v4">
        <div className="panel-title-v4">Recent activity</div>
        <div className="panel-link-v4">{myBookings.length} total</div>
      </div>

      <div className="booking-list-v4 dashboard-activity-v9">
        {recentActivity.length === 0 ? (
          <div className="empty-state-v7 compact">
            <FiCalendar />
            <strong>No recent activity</strong>
            <span>New bookings, payments, and updates will appear here.</span>
          </div>
        ) : recentActivity.map((booking) => (
          <div key={booking.id} className="simple-card-v4">
            <div className="booking-name-v4">{booking.customerName || booking.customerUsername}</div>
            {booking.teamMemberName ? (
              <div className="booking-meta-v4"><FiScissors /> Provider: {booking.teamMemberName}</div>
            ) : null}
            <div className="booking-meta-v4"><FiCalendar /> {booking.date} - {booking.timeLabel || formatTimeLabel(booking.time)}</div>
            <div className="booking-meta-v4"><FiScissors /> {booking.service}</div>
            <div className="booking-meta-v4">Payment: {getPaymentMethodLabel(booking.paymentMethod)} - {booking.paymentStatus || "unpaid"}</div>
            <div className="inline-actions-v4">
              <span className={`booking-badge-v4 status-${booking.status}`}>{booking.status}</span>
              {booking.status === "pending" && (
                <>
                  <button className="mini-action-btn-v4 success" onClick={() => approveBooking(booking.id)}>Approve</button>
                  <button className="mini-action-btn-v4 danger" onClick={() => rejectBooking(booking.id)}>Reject</button>
                </>
              )}
              {booking.status === "confirmed" && (
                <button className="mini-action-btn-v4 success" onClick={() => completeBooking(booking.id)}>Mark done</button>
              )}
              {booking.paymentMethod === "cash" && booking.paymentStatus !== "paid" && (
                <button className="mini-action-btn-v4 success" onClick={() => confirmCashPayment(booking.id)}>Confirm cash</button>
              )}
              <button className="mini-action-btn-v4" onClick={() => onOpenConversation(booking)}>Message</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}




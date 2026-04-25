import { FiBell, FiCalendar, FiClock, FiEdit2, FiMapPin, FiScissors, FiStar } from "react-icons/fi";
import { lazy } from "react";

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
  getBookingsForCalendar,
  dateValueToDate,
  formatMoney,
  getBadgeLabel,
  formatTimeLabel,
}) {
  if (!barber) {
    return (
      <div className="content-v4 standard-page-v4">
        <div className="simple-card-v4">No barber profile found yet.</div>
      </div>
    );
  }

  const myBookings = getBookingsForCalendar(bookings, barber, currentUser?.username);
  const pending = myBookings.filter((item) => item.status === "pending");
  const confirmed = myBookings.filter((item) => item.status === "confirmed");
  const completed = myBookings.filter((item) => item.status === "completed");
  const cancelled = myBookings.filter((item) => item.status === "cancelled" || item.status === "rejected");
  const totalRevenue = completed.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const totalCommission = completed.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0);
  const totalPayout = completed.reduce((sum, item) => sum + Number(item.barberAmount || (Number(item.price || 0) * 0.9)), 0);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const thisWeekCount = myBookings.filter((booking) => {
    const value = booking.dateValue || booking.date;
    if (!value) return false;
    const diff = dateValueToDate(value).getTime() - todayStart;
    const dayDiff = diff / (24 * 60 * 60 * 1000);
    return dayDiff >= 0 && dayDiff < 7;
  }).length;

  return (
    <div className="content-v4 standard-page-v4">
      <div className="dashboard-hero-v4 simple-card-v4">
        <div className="dashboard-hero-copy-v4">
          <div className="panel-title-v4">Barber dashboard</div>
          <div className="profile-sub-v4">{barber.business_name}</div>
          <div className="profile-sub-v4"><FiMapPin /> {barber.location}</div>
          <div className="profile-sub-v4"><FiClock /> {barber.availability?.start} - {barber.availability?.end}</div>
          <div className="profile-sub-v4">Plan: {subscription?.tier || barber.subscription?.tier || "FREE"} · {subscription?.features?.topBarberBadge ? "Top barber badge active" : "Standard visibility"}</div>
        </div>
        <div className="dashboard-hero-actions-v4">
          <button className="secondary-btn-v4 compact-btn-v4" onClick={onOpenManageStand}>
            <FiEdit2 /> Manage stand
          </button>
          <button className="secondary-btn-v4 compact-btn-v4" onClick={onOpenReports}>
            <FiStar /> Reviews & reports
          </button>
        </div>
      </div>

      <div className="dashboard-stats-v4 dashboard-stats-v4-large">
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{pending.length}</div>
          <div className="stat-label-v4">Pending</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{confirmed.length}</div>
          <div className="stat-label-v4">Confirmed</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{completed.length}</div>
          <div className="stat-label-v4">Completed</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{cancelled.length}</div>
          <div className="stat-label-v4">Cancelled</div>
        </div>
      </div>

      <div className="dashboard-stats-v4 dashboard-stats-v4-secondary">
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{thisWeekCount}</div>
          <div className="stat-label-v4">This week</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{formatMoney(totalRevenue)}</div>
          <div className="stat-label-v4">Gross revenue</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{formatMoney(totalPayout)}</div>
          <div className="stat-label-v4">Net payout</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{formatMoney(totalCommission)}</div>
          <div className="stat-label-v4">Commission</div>
        </div>
        <div className="simple-card-v4 stat-card-v4">
          <div className="stat-value-v4">{subscription?.tier || getBadgeLabel(barber.verified)}</div>
          <div className="stat-label-v4">Plan</div>
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
              <FiBell /> {(item.title || "Notification")} — {(item.description || item.message || "")}
            </div>
          ))
        )}
      </div>

      <div className="booking-list-v4">
        {myBookings.map((booking) => (
          <div key={booking.id} className="simple-card-v4">
            <div className="booking-name-v4">{booking.customerName || booking.customerUsername}</div>
            {booking.teamMemberName ? (
              <div className="booking-meta-v4"><FiScissors /> Barber: {booking.teamMemberName}</div>
            ) : null}
            <div className="booking-meta-v4"><FiCalendar /> {booking.date} · {booking.timeLabel || formatTimeLabel(booking.time)}</div>
            <div className="booking-meta-v4"><FiScissors /> {booking.service}</div>
            <div className="booking-meta-v4">Payment: {(booking.paymentMethod || "cash") === "wallet" ? "Wallet" : "Cash"} · {booking.paymentStatus || "unpaid"}</div>
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




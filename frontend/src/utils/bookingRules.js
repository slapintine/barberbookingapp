export function getBookingCooldownInfo(bookings, currentUser, barber, nowMs = Date.now()) {
  if (!currentUser?.username || !barber?.id) {
    return { blocked: false, reason: "", minutesLeft: 0 };
  }

  const cooldownMs = 30 * 60 * 1000;

  const recentForSameBarber = (bookings || [])
    .filter((item) => {
      const sameCustomer = String(item.customerUsername || "") === String(currentUser.username || "");
      const sameBarber =
        String(item.barberId || "") === String(barber.id || "") ||
        String(item.barberOwnerUsername || "") === String(barber.ownerUsername || "") ||
        String(item.barberUsername || "") === String(barber.ownerUsername || "");
      return sameCustomer && sameBarber;
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const activeExisting = recentForSameBarber.find((item) =>
    ["pending", "confirmed"].includes(String(item.status || "").toLowerCase())
  );

  if (activeExisting) {
    return {
      blocked: true,
      reason: "You already have an active booking with this barber.",
      minutesLeft: 0,
    };
  }

  const latest = recentForSameBarber[0];
  if (!latest?.createdAt) {
    return { blocked: false, reason: "", minutesLeft: 0 };
  }

  const elapsed = nowMs - new Date(latest.createdAt).getTime();
  if (elapsed < cooldownMs) {
    const minutesLeft = Math.max(1, Math.ceil((cooldownMs - elapsed) / 60000));
    return {
      blocked: true,
      reason: `Please wait about ${minutesLeft} more minute${minutesLeft === 1 ? "" : "s"} before booking this barber again.`,
      minutesLeft,
    };
  }

  return { blocked: false, reason: "", minutesLeft: 0 };
}

export function barberMatchesBooking(booking, barber, username) {
  if (!booking || !barber) return false;

  const bookingBarberId = String(booking.barberId || "");
  const barberId = String(barber.id || "");
  const bookingOwner = String(booking.barberOwnerUsername || booking.barberUsername || booking.ownerUsername || "");
  const barberOwner = String(barber.ownerUsername || username || "");
  const bookingName = String(booking.barberName || "").trim().toLowerCase();
  const barberName = String(barber.business_name || "").trim().toLowerCase();

  return (
    (bookingBarberId && barberId && bookingBarberId === barberId) ||
    (bookingOwner && barberOwner && bookingOwner === barberOwner) ||
    (bookingName && barberName && bookingName === barberName)
  );
}

export function dateValueToDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

export function getBookingsForCalendar(bookings = [], barber = null, username = "") {
  if (!barber) return [];
  return (bookings || []).filter((item) => barberMatchesBooking(item, barber, username));
}

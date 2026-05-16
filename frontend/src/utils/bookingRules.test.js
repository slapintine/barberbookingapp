import test from "node:test";
import assert from "node:assert/strict";
import {
  barberMatchesBooking,
  getBookingCooldownInfo,
  getBookingsForCalendar,
} from "./bookingRules.js";

const barber = {
  id: 42,
  ownerUsername: "prime-owner",
  business_name: "Prime Fade Studio",
};

test("blocks a customer from creating a second active booking with the same barber", () => {
  const result = getBookingCooldownInfo(
    [
      {
        barberId: 42,
        customerUsername: "alice",
        status: "confirmed",
        createdAt: "2026-04-26T08:00:00.000Z",
      },
    ],
    { username: "alice" },
    barber,
    Date.parse("2026-04-26T08:05:00.000Z")
  );

  assert.equal(result.blocked, true);
  assert.equal(result.reason, "You already have an active booking with this barber.");
});

test("applies the 30 minute repeat-booking cooldown after inactive bookings", () => {
  const result = getBookingCooldownInfo(
    [
      {
        barberId: 42,
        customerUsername: "alice",
        status: "cancelled",
        createdAt: "2026-04-26T08:00:00.000Z",
      },
    ],
    { username: "alice" },
    barber,
    Date.parse("2026-04-26T08:10:00.000Z")
  );

  assert.equal(result.blocked, true);
  assert.equal(result.minutesLeft, 20);
});

test("matches bookings to barber ownership without leaking unrelated bookings into calendar", () => {
  const matchingByOwner = {
    barberOwnerUsername: "prime-owner",
    barberName: "Other display name",
  };
  const unrelated = {
    barberId: 7,
    barberOwnerUsername: "someone-else",
    barberName: "Another Stand",
  };

  assert.equal(barberMatchesBooking(matchingByOwner, barber), true);
  assert.deepEqual(getBookingsForCalendar([matchingByOwner, unrelated], barber), [matchingByOwner]);
});

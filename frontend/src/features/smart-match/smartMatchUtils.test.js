import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSmartMatchBookingContext,
  getSmartMatchCriteriaKey,
} from "./smartMatchContext.js";

test("Smart Match preserves selected service and booking preferences for handoff", () => {
  const context = buildSmartMatchBookingContext(
    {
      providerId: 12,
      serviceId: 77,
      serviceName: "Gel nails",
      priceMin: 25000,
      priceMax: 25000,
      priceLabel: "UGX 25,000",
      pricingType: "fixed",
      durationMinutes: 45,
      requestedDate: "2026-07-28",
      requestedTime: "15:30",
      serviceKey: "beauty",
    },
    { id: 12 },
    {
      selectedService: { key: "beauty", label: "Beauty" },
      selectedWhen: "today",
      selectedLocationType: "enter_address",
      selectedAddress: "Ntinda",
      budgetMax: "30000",
      minimumRating: "4.5",
      notes: "Quiet appointment preferred",
    }
  );

  assert.equal(context.providerId, "12");
  assert.equal(context.serviceId, 77);
  assert.equal(context.serviceName, "Gel nails");
  assert.equal(context.requestedDate, "2026-07-28");
  assert.equal(context.requestedTime, "15:30");
  assert.equal(context.bookingLocationType, "customer_location");
  assert.equal(context.bookingAddress, "Ntinda");
  assert.equal(context.notes, "Quiet appointment preferred");
  assert.equal(context.preferences.budgetMax, "30000");
  assert.equal(context.preferences.minimumRating, "4.5");
});

test("Smart Match draft keys include optional preferences so stale results are not reused", () => {
  const base = {
    selectedService: { key: "beauty", label: "Beauty" },
    selectedWhen: "today",
    selectedLocationType: "enter_address",
    selectedAddress: "Ntinda",
  };

  assert.notEqual(
    getSmartMatchCriteriaKey({ ...base, preferredDate: "2026-07-28", preferredTime: "15:30", budgetMax: "30000" }),
    getSmartMatchCriteriaKey({ ...base, preferredDate: "2026-07-29", preferredTime: "15:30", budgetMax: "30000" })
  );
  assert.notEqual(
    getSmartMatchCriteriaKey({ ...base, preferredDate: "2026-07-28", preferredTime: "15:30", budgetMax: "30000" }),
    getSmartMatchCriteriaKey({ ...base, preferredDate: "2026-07-28", preferredTime: "16:00", budgetMax: "30000" })
  );
});

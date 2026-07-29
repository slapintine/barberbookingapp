import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildSmartMatchBookingContext,
  buildSmartMatchProvider,
  getSmartMatchCriteriaKey,
} from "./smartMatchContext.js";

const smartMatchUtilsSource = fs.readFileSync(
  path.resolve("src/features/smart-match/smartMatchUtils.js"),
  "utf8"
);

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

test("Smart Match builds booking-capable provider data from lean match results", () => {
  const provider = buildSmartMatchProvider(
    {
      providerId: 15,
      businessName: "Nakwero Platinum Visibility Studio",
      serviceId: 91,
      serviceName: "Signature service 1",
      serviceKey: "barber",
      serviceLabel: "Barber",
      priceMin: 26000,
      priceMax: 26000,
      pricingType: "fixed",
      durationMinutes: 30,
      rating: 4.8,
      reviewsCount: 5,
      provider: {
        location: "Nakwero, Wakiso",
        latitude: 0.3476,
        longitude: 32.5825,
      },
    },
    { id: 15, username: "qa_platinum_provider", email: "qa.platinum@queless.test", ownerUsername: "qa_platinum_provider", owner_email: "qa.platinum@queless.test" }
  );

  assert.equal(provider.id, "15");
  assert.equal(provider.business_name, "Nakwero Platinum Visibility Studio");
  assert.equal(provider.business_status, "active");
  assert.equal(provider.is_published, 1);
  assert.equal(provider.is_demo, 0);
  assert.equal(provider.ownerUsername, "");
  assert.equal(provider.owner_email, "");
  assert.equal(provider.username, "");
  assert.equal(provider.email, "");
  assert.equal(provider.services.length, 1);
  assert.equal(provider.services[0].service_name, "Signature service 1");
  assert.equal(provider.services[0].price_extra, 26000);
  assert.equal(provider.services[0].duration_minutes, 30);
});

test("Smart Match utility exports booking-capable provider handoff helper", () => {
  assert.match(smartMatchUtilsSource, /buildSmartMatchProvider/);
  assert.match(smartMatchUtilsSource, /from "\.\/smartMatchContext\.js"/);
});

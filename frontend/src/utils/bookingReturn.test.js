import assert from "node:assert/strict";
import test from "node:test";
import {
  createPendingBookingIntent,
  isSafeInternalAppPath,
  resolvePendingBookingIntent,
  sanitizeBookingReturnPath,
} from "./bookingReturn.js";

test("booking return paths allow internal app routes only", () => {
  assert.equal(isSafeInternalAppPath("/app/provider/12"), true);
  assert.equal(isSafeInternalAppPath("bookings"), true);
  assert.equal(isSafeInternalAppPath("https://evil.example/app"), false);
  assert.equal(isSafeInternalAppPath("//evil.example/app"), false);
  assert.equal(isSafeInternalAppPath("javascript:alert(1)"), false);
  assert.equal(isSafeInternalAppPath("/admin"), false);
});

test("external booking return urls fall back to the app root", () => {
  assert.equal(sanitizeBookingReturnPath("https://evil.example/login"), "/app/");
});

test("pending booking intent preserves selected provider, service, date and time", () => {
  const intent = createPendingBookingIntent({
    providerId: "4",
    serviceId: "7",
    selectedDate: "2026-07-20",
    selectedTime: "09:30",
    returnPath: "/app/home",
  });

  assert.deepEqual(
    {
      providerId: intent.providerId,
      serviceId: intent.serviceId,
      selectedDate: intent.selectedDate,
      selectedTime: intent.selectedTime,
      returnPath: intent.returnPath,
    },
    {
      providerId: 4,
      serviceId: 7,
      selectedDate: "2026-07-20",
      selectedTime: "09:30",
      returnPath: "/app/home",
    }
  );
});

test("pending booking restore reports missing provider and service cleanly", () => {
  const intent = createPendingBookingIntent({ providerId: 4, serviceId: 7 });

  assert.equal(resolvePendingBookingIntent(intent, []).reason, "provider_missing");
  assert.equal(resolvePendingBookingIntent(intent, [{ id: 4, services: [] }]).reason, "service_missing");
});

test("pending booking restore returns the matching provider and service", () => {
  const service = { id: 7, service_name: "Consultation" };
  const provider = { id: 4, business_name: "QA Stand", services: [service] };
  const intent = createPendingBookingIntent({ providerId: 4, serviceId: 7 });
  const result = resolvePendingBookingIntent(intent, [provider]);

  assert.equal(result.ok, true);
  assert.equal(result.provider, provider);
  assert.equal(result.service, service);
});

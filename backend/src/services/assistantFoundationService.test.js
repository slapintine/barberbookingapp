import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProviderDailyBriefing,
  getAssistantAction,
  parseSmartMatchPrompt,
} from "./assistantFoundationService.js";

test("Smart Match assistant extracts real booking preferences from customer text", () => {
  const parsed = parseSmartMatchPrompt("I need beauty services near Ntinda today at 3:30pm under UGX 30,000");

  assert.equal(parsed.intent, "smart_match_preferences");
  assert.equal(parsed.entities.serviceKey, "beauty");
  assert.equal(parsed.entities.serviceLabel, "Beauty");
  assert.equal(parsed.entities.when, "today");
  assert.equal(parsed.entities.preferredTime, "15:30");
  assert.equal(parsed.entities.budgetMax, 30000);
  assert.equal(parsed.entities.locationType, "enter_address");
  assert.match(parsed.entities.address, /Ntinda/i);
  assert.deepEqual(parsed.missing, []);
  assert.equal(parsed.action.allowed, true);
});

test("Smart Match assistant parses natural timing, location, budget, and rating safely", () => {
  const parsed = parseSmartMatchPrompt(
    "I need a barber near Nakwero tomorrow morning below UGX 30,000.",
    { currentDate: "2026-07-28T09:00:00+03:00" }
  );

  assert.equal(parsed.entities.serviceKey, "barber");
  assert.equal(parsed.entities.preferredDate, "2026-07-29");
  assert.equal(parsed.entities.preferredTime, "09:00");
  assert.equal(parsed.entities.budgetMax, 30000);
  assert.match(parsed.entities.address, /Nakwero/i);
});

test("Smart Match assistant extracts rating preference without inventing unavailable fields", () => {
  const parsed = parseSmartMatchPrompt(
    "Find me a highly rated makeup artist in Wakiso this Saturday.",
    { currentDate: "2026-07-28T09:00:00+03:00" }
  );

  assert.equal(parsed.entities.serviceKey, "beauty");
  assert.equal(parsed.entities.minimumRating, 4.5);
  assert.equal(parsed.entities.preferredDate, "2026-08-01");
  assert.equal(parsed.entities.locationType, "enter_address");
  assert.match(parsed.entities.address, /Wakiso/i);
});

test("Smart Match assistant supports broad next-week requests", () => {
  const parsed = parseSmartMatchPrompt(
    "Who can do photography next week?",
    { currentDate: "2026-07-28T09:00:00+03:00" }
  );

  assert.equal(parsed.entities.serviceKey, "events-photography");
  assert.equal(parsed.entities.when, "this_week");
  assert.equal(parsed.entities.preferredDate, "2026-08-04");
  assert.equal(parsed.entities.preferredTime, "");
});

test("Smart Match assistant asks for missing fields instead of inventing them", () => {
  const parsed = parseSmartMatchPrompt("Can someone help me soon?");

  assert.equal(parsed.entities.serviceKey, "");
  assert.equal(parsed.entities.address, "");
  assert.ok(parsed.missing.includes("service"));
  assert.ok(parsed.missing.includes("location"));
});

test("assistant action registry keeps write actions explicit", () => {
  const booking = getAssistantAction("smart_match.start_booking", "customer");
  const unknown = getAssistantAction("smart_match.delete_booking", "customer");

  assert.equal(booking.allowed, true);
  assert.equal(booking.requiresConfirmation, true);
  assert.equal(booking.writesData, true);
  assert.equal(unknown.allowed, false);
});

test("provider daily briefing uses only available stand signals", () => {
  const briefing = buildProviderDailyBriefing({
    stand: {
      name: "Spark Beauty",
      plan: "free",
      profileCompleteness: 50,
      missingFields: ["opening hours", "main stand photo"],
    },
    signals: {
      bookingsAvailable: false,
      reviewsAvailable: false,
      completedBookings: 0,
      cancelledBookings: 0,
    },
  });

  assert.equal(briefing.standName, "Spark Beauty");
  assert.equal(briefing.dataLimits.revenueAvailable, false);
  assert.match(briefing.items.map((item) => item.title).join(" | "), /Finish the most important stand details/);
  assert.match(briefing.items.map((item) => item.title).join(" | "), /No booking history/);
  assert.doesNotMatch(JSON.stringify(briefing), /UGX|revenue estimate|earnings/i);
});

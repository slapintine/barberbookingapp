import assert from "node:assert/strict";
import test from "node:test";
import { detectProviderCoachIntent } from "./providerCoachDiagnosis.js";
import { buildSmartRuleBasedCoachResponse } from "./providerCoachChatService.js";

const context = {
  stand: {
    name: "QA Services",
    status: "published",
    plan: "premium",
    planActive: true,
    missingFields: [],
    profileCompleteness: 92,
  },
  services: [
    { name: "Haircut", description: "Clean haircut service with styling.", price: "UGX 20,000", durationMinutes: 45, available: true, hasPhoto: true },
    { name: "Braids", description: "Protective braid service for customers.", price: "UGX 80,000", durationMinutes: 180, available: true, hasPhoto: true },
  ],
  availability: [
    { day: 1, open: true, start: "09:00", end: "18:00" },
  ],
  signals: {
    bookingsAvailable: true,
    totalBookings: 7,
    completedBookings: 4,
    cancelledBookings: 1,
    reviewsAvailable: true,
    reviewCount: 3,
    averageRating: 4.6,
    photoCount: 4,
  },
  bookingAnalytics: {
    todayBookings: [
      { time: "10:00", service: "Haircut", status: "confirmed" },
      { time: "14:30", service: "Braids", status: "pending" },
    ],
    tomorrowOpen: true,
    tomorrowStart: "09:00",
    tomorrowEnd: "18:00",
    tomorrowBookings: [{ time: "11:00", service: "Haircut", status: "confirmed" }],
    attentionBookings: [{ time: "14:30", service: "Braids", status: "pending" }],
    thisWeekCount: 5,
    lastWeekCount: 2,
    bestServices: [{ service: "Haircut", count: 4 }, { service: "Braids", count: 3 }],
    cancelledByService: [{ service: "Braids", count: 1 }],
    busiestHours: [{ hour: "10:00", count: 3 }, { hour: "14:00", count: 2 }],
    busiestDays: [["Monday", 4], ["Wednesday", 2]],
    returningCustomerCount: 2,
  },
};

function ask(message) {
  const intentResult = detectProviderCoachIntent(message, []);
  return buildSmartRuleBasedCoachResponse({ message, context, intentResult });
}

test("Business Assistant answers provider operational questions from real context", () => {
  assert.match(ask("What bookings do I have today?").answer, /2 active bookings?.*10:00.*Haircut.*14:30.*Braids/i);
  assert.match(ask("What is my schedule tomorrow?").answer, /Tomorrow is set from 09:00 to 18:00/i);
  assert.match(ask("Which bookings need attention?").answer, /1 booking.*Braids.*pending/i);
});

test("Business Assistant answers analytics questions without inventing causes", () => {
  assert.match(ask("Compare this week with last week.").answer, /This week has 5.*Last week had 2.*cannot confirm the cause/i);
  assert.match(ask("Which service performs best?").answer, /Haircut.*4 bookings/i);
  assert.match(ask("Which service has the most cancellations?").answer, /Braids.*1/i);
  assert.match(ask("What are my busiest hours?").answer, /10:00 \(3\).*14:00 \(2\)/i);
  assert.match(ask("How many returning customers do I have?").answer, /2 returning customer/i);
});


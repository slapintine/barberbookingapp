import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const profileSource = fs.readFileSync(new URL("./pages/ProfilePage.jsx", import.meta.url), "utf8");
const reportsSource = fs.readFileSync(new URL("./features/barbers/ReportsScreen.jsx", import.meta.url), "utf8");
const coachSource = fs.readFileSync(new URL("./features/barbers/ProviderCoachChatScreen.jsx", import.meta.url), "utf8");
const coachApiSource = fs.readFileSync(new URL("./api/aiCoachApi.js", import.meta.url), "utf8");
const smartMatchSource = fs.readFileSync(new URL("./features/smart-match/SmartMatchPage.jsx", import.meta.url), "utf8");

test("active Customer Premium uses the dedicated premium experience and real Smart Match navigation", () => {
  assert.match(profileSource, /customerPremiumActive\s*\?\s*\(\s*<CustomerPremiumExperience/);
  assert.match(profileSource, /onUseSmartMatch=\{onOpenSmartMatch\}/);
  assert.match(appSource, /onOpenSmartMatch=\{\(\) => setActiveTab\("smartMatch"\)\}/);
  assert.doesNotMatch(appSource, /Customer Premium is active\. Smart Match is unlocked\./);
});

test("Reports uses the dedicated Provider Coach preview instead of the legacy pill stack", () => {
  assert.match(reportsSource, /<ProviderCoachPreviewCard/);
  assert.doesNotMatch(reportsSource, /reports-coach-chip-list-v16/);
  assert.doesNotMatch(reportsSource, /reports-coach-modal-v15/);
});

test("Provider Coach opens a native stand-aware chat workspace", () => {
  assert.match(coachSource, /subscription,/);
  assert.match(coachSource, /sendProviderCoachMessage\(question, history\)/);
  assert.match(coachSource, /Why am I not getting bookings\?/);
  assert.match(coachSource, /How do I improve my Platinum stand\?/);
  assert.match(coachSource, /Create or save your stand first so Coach can give advice/);
  assert.match(coachSource, /result\?\.nextBestAction/);
  assert.match(coachSource, /result\?\.suggestedChips/);
  assert.match(coachSource, /provider-coach-next-action/);
  assert.match(coachSource, /provider-coach-response-chips/);
  assert.match(coachSource, /\(\{ role, content, intent, topic \}\)/);
  assert.match(coachApiSource, /api\/provider-coach\/chat/);
  assert.match(appSource, /ProviderCoachChatScreen/);
});

test("Smart Match subscription notices distinguish success from real errors", () => {
  assert.match(smartMatchSource, /smart-match-subscription-message is-success/);
  assert.match(smartMatchSource, /smart-match-subscription-message is-error/);
});

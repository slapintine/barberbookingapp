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

test("Business Assistant opens a native stand-aware chat workspace", () => {
  assert.match(coachSource, /subscription,/);
  assert.match(coachSource, /sendProviderCoachMessage\(question, history\)/);
  assert.match(coachSource, /Why am I not getting bookings\?/);
  assert.match(coachSource, /Explain my current plan/);
  assert.match(coachSource, /Queless Business Assistant/);
  assert.match(coachSource, /Create or save your stand first so Coach can give advice|Create or save your stand first so Business Assistant can give advice/);
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

test("Premium Smart Match renders one assistant composer without the standard form underneath", () => {
  assert.match(smartMatchSource, /const showPremiumAssistant = premiumActive && standardSmartMatchActive && !includedButUnavailable;/);
  assert.match(smartMatchSource, /const showStandardSmartMatch = standardSmartMatchActive && !includedButUnavailable && !showPremiumAssistant;/);
  assert.match(smartMatchSource, /\{showPremiumAssistant \? \(\s*<SmartMatchAssistantPanel/);
  assert.match(smartMatchSource, /\{showStandardSmartMatch \? <SmartMatchStepper/);
  assert.match(smartMatchSource, /\{showStandardSmartMatch && state\.step === "need" \? \(/);
  assert.match(smartMatchSource, /\{showStandardSmartMatch \? \(\s*<footer className="smart-match-footer">/);
  assert.match(smartMatchSource, /data-testid="smart-match-assistant-form"/);
  assert.match(smartMatchSource, /data-testid="smart-match-assistant-input"/);
  assert.doesNotMatch(smartMatchSource, /\{standardSmartMatchActive && !includedButUnavailable && state\.step/);
});

test("Free Smart Match leads with the standard flow before the Premium promotion", () => {
  const freeLabelIndex = smartMatchSource.indexOf('data-testid="smart-match-free-label"');
  const needStepIndex = smartMatchSource.indexOf('{showStandardSmartMatch && state.step === "need" ? (');
  const matchesStepIndex = smartMatchSource.indexOf('{showStandardSmartMatch && state.step === "matches" ? (');
  const promotionRenderIndex = smartMatchSource.indexOf('{premiumPromotion}');

  assert.match(smartMatchSource, /const showPremiumPromotion = showStandardSmartMatch && !premiumActive && state\.step === "matches";/);
  assert.match(smartMatchSource, /data-testid="smart-match-premium-promotion"/);
  assert.match(smartMatchSource, /You're using Free Smart Match/);
  assert.match(smartMatchSource, /Premium Smart Match can guide you through your request in a conversation/);
  assert.ok(freeLabelIndex > -1, "Free Smart Match label should be rendered");
  assert.ok(needStepIndex > -1, "Free Smart Match need step should remain available");
  assert.ok(matchesStepIndex > -1, "Free Smart Match results step should remain available");
  assert.ok(promotionRenderIndex > matchesStepIndex, "Premium promotion should render after Free results/no-results content");
  assert.ok(freeLabelIndex < needStepIndex, "Free Smart Match label should appear before the standard form");
  assert.doesNotMatch(smartMatchSource, /Premium Customer adds the conversational Smart Match Assistant/);
  assert.doesNotMatch(smartMatchSource, /!\s*premiumActive && state\.step === "need"/);
});

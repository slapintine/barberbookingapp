import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isBusinessPubliclyVisible } from "./businessVisibility.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedScript = readFileSync(join(__dirname, "../scripts/seedPlanQaFixtures.js"), "utf8");

test("plan QA provider fixtures remain visible to service discovery", () => {
  const fixtureNames = [...seedScript.matchAll(/businessName:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(fixtureNames.length >= 3);
  for (const businessName of fixtureNames) {
    assert.equal(
      isBusinessPubliclyVisible({
        business_name: businessName,
        business_status: "active",
        is_published: 1,
        is_demo: 0,
        subscription_tier: "FREE",
        subscription_status: "active",
        image: "",
        location: "Nakwero, Wakiso",
      }),
      true,
      `${businessName} should not be excluded as a demo or QA-only business`
    );
  }
});

test("plan QA fixtures seed distinct Free and Customer Premium accounts", () => {
  assert.match(seedScript, /const PREMIUM_CUSTOMER_INDEX = 1;/);
  assert.match(seedScript, /DELETE FROM customer_subscriptions WHERE user_id IN/);
  assert.match(seedScript, /'PREMIUM', 10000, 'active'/);
  assert.ok(seedScript.includes("qa_customer_${PREMIUM_CUSTOMER_INDEX}"));
  assert.match(seedScript, /tier: "FREE"/);
});

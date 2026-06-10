import test from "node:test";
import assert from "node:assert/strict";
import { isBusinessPubliclyVisible } from "./businessVisibility.js";

const future = "2099-01-01T00:00:00.000Z";
const past = "2020-01-01T00:00:00.000Z";
const now = new Date("2026-05-13T00:00:00.000Z");

test("hides draft or unpublished businesses even when a plan exists", () => {
  assert.equal(
    isBusinessPubliclyVisible(
      {
        business_status: "draft",
        is_published: 1,
        subscription_tier: "FREE",
        subscription_status: "active",
        subscription_expires_at: future,
      },
      null,
      now
    ),
    false
  );

  assert.equal(
    isBusinessPubliclyVisible(
      {
        business_status: "active",
        is_published: 0,
        subscription_tier: "FREE",
        subscription_status: "active",
        subscription_expires_at: future,
      },
      null,
      now
    ),
    false
  );
});

test("hides active businesses when subscription access is expired", () => {
  assert.equal(
    isBusinessPubliclyVisible(
      {
        business_status: "active",
        is_published: 1,
        subscription_tier: "PREMIUM",
        subscription_status: "active",
        subscription_expires_at: past,
      },
      null,
      now
    ),
    false
  );

  assert.equal(
    isBusinessPubliclyVisible(
      {
        business_status: "active",
        is_published: 1,
        subscription_tier: "FREE",
        subscription_status: "trialing",
        trial_status: "active",
        trial_ends_at: past,
      },
      null,
      now
    ),
    false
  );
});

test("allows published active Free businesses without payment expiry", () => {
  assert.equal(
    isBusinessPubliclyVisible(
      {
        business_status: "active",
        is_published: 1,
        subscription_tier: "FREE",
        subscription_status: "active",
        subscription_expires_at: null,
      },
      null,
      now
    ),
    true
  );
});

test("allows only published active businesses with free or unexpired paid access", () => {
  assert.equal(
    isBusinessPubliclyVisible(
      {
        business_status: "active",
        is_published: 1,
        subscription_tier: "PLATINUM",
        subscription_status: "active",
        subscription_expires_at: future,
      },
      null,
      now
    ),
    true
  );

  assert.equal(
    isBusinessPubliclyVisible(
      {
        business_status: "active",
        is_published: 1,
        subscription_tier: "FREE",
        subscription_status: "trialing",
        trial_status: "active",
        trial_ends_at: future,
      },
      null,
      now
    ),
    false
  );
});

test("allows manually approved live businesses without a paid subscription", () => {
  assert.equal(
    isBusinessPubliclyVisible(
      {
        business_status: "approved",
        is_published: 1,
        subscription_tier: "FREE",
        subscription_status: "manual_approved",
      },
      null,
      now
    ),
    true
  );
});

test("hides demo-like active businesses even when flags are missing", () => {
  assert.equal(
    isBusinessPubliclyVisible(
      {
        business_name: "Demo Cuts",
        business_status: "active",
        is_published: 1,
        subscription_tier: "FREE",
        subscription_status: "active",
        subscription_expires_at: future,
      },
      null,
      now
    ),
    false
  );

  assert.equal(
    isBusinessPubliclyVisible(
      {
        business_name: "QA Premium Growth Studio",
        business_status: "active",
        is_published: 1,
        subscription_tier: "PREMIUM",
        subscription_status: "active",
        subscription_expires_at: future,
      },
      null,
      now
    ),
    false
  );
});

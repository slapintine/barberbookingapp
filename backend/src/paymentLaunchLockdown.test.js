import test from "node:test";
import assert from "node:assert/strict";
import { env } from "./config/env.js";
import { checkout, getMtnPaymentStatus, handleMtnWebhook, testMtnPaymentInitiation, verify } from "./controllers/paymentController.js";
import { initiateCustomerWalletTopup, requestWithdrawal } from "./controllers/walletController.js";
import { startCustomerSubscriptionUpgrade } from "./controllers/customerSubscriptionController.js";

function makeReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    user: { id: 1, role: "customer" },
    get() {
      return "";
    },
    ...overrides,
  };
}

function makeRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

async function capturesNext(handler, req = makeReq()) {
  const res = makeRes();
  let captured = null;
  await handler(req, res, (error) => {
    captured = error;
  });
  return { error: captured, res };
}

test("online booking payment endpoints are disabled while launch payments are off", async () => {
  const previous = env.bookingOnlinePaymentsEnabled;
  env.bookingOnlinePaymentsEnabled = false;
  try {
    for (const handler of [checkout, verify, getMtnPaymentStatus, testMtnPaymentInitiation]) {
      const { error } = await capturesNext(handler, makeReq({ body: { bookingId: 1 }, params: { reference: "pay-ref" } }));
      assert.equal(error?.statusCode, 503);
      assert.match(error.message, /not available yet|coming soon/i);
    }
  } finally {
    env.bookingOnlinePaymentsEnabled = previous;
  }
});

test("mobile-money webhooks fail safely before financial mutation when all payment flows are disabled", async () => {
  const previousOnline = env.bookingOnlinePaymentsEnabled;
  const previousWallet = env.bookingWalletPaymentsEnabled;
  const previousWebhookToken = env.mobileMoneyWebhookToken;
  env.bookingOnlinePaymentsEnabled = false;
  env.bookingWalletPaymentsEnabled = false;
  env.mobileMoneyWebhookToken = "trusted-launch-lockdown-webhook-token";
  try {
    const unauthorized = await capturesNext(handleMtnWebhook, makeReq({ body: { reference: "pay-ref", status: "successful" } }));
    assert.equal(unauthorized.error, null);
    assert.equal(unauthorized.res.statusCode, 401);

    const { res, error } = await capturesNext(
      handleMtnWebhook,
      makeReq({
        body: { reference: "pay-ref", status: "successful" },
        get(name) {
          return name.toLowerCase() === "x-webhook-token" ? "trusted-launch-lockdown-webhook-token" : "";
        },
      })
    );
    assert.equal(error, null);
    assert.equal(res.statusCode, 503);
    assert.equal(res.payload.success, false);
    assert.match(res.payload.message, /callbacks are disabled/i);
  } finally {
    env.bookingOnlinePaymentsEnabled = previousOnline;
    env.bookingWalletPaymentsEnabled = previousWallet;
    env.mobileMoneyWebhookToken = previousWebhookToken;
  }
});

test("wallet money-moving endpoints require the wallet launch flag", async () => {
  const previous = env.bookingWalletPaymentsEnabled;
  env.bookingWalletPaymentsEnabled = false;
  try {
    for (const handler of [initiateCustomerWalletTopup, requestWithdrawal]) {
      const { error } = await capturesNext(handler, makeReq({ body: { amount: 1000 } }));
      assert.equal(error?.statusCode, 503);
      assert.match(error.message, /not available yet/i);
    }
  } finally {
    env.bookingWalletPaymentsEnabled = previous;
  }
});

test("paid customer plan upgrade is gated when online payments are disabled", async () => {
  const previous = env.bookingOnlinePaymentsEnabled;
  env.bookingOnlinePaymentsEnabled = false;
  try {
    const { error } = await capturesNext(
      startCustomerSubscriptionUpgrade,
      makeReq({
        body: { billingCycle: "monthly", provider: "mtn_mobile_money", phoneNumber: "0772123456" },
        user: { id: 1, role: "customer" },
      })
    );
    assert.equal(error?.statusCode, 503);
    assert.equal(error.code, "ONLINE_PAYMENTS_DISABLED");
  } finally {
    env.bookingOnlinePaymentsEnabled = previous;
  }
});

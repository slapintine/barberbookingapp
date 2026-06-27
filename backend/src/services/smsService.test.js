import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { getSmsConfig, maskPhone, normalizePhoneNumber, sanitizeSmsLogText, sendSms } from "./smsService.js";

// These tests mutate the shared `env` object and AFRICASTALKING_ALLOW_LIVE_SEND.
// `node --test` runs each test file in its own process, so this stays isolated.
const ENV_KEYS = ["nodeEnv", "africasTalkingUsername", "africasTalkingApiKey", "africasTalkingEnv", "smsEnabled"];

function snapshotEnv() {
  const snap = { _allow: process.env.AFRICASTALKING_ALLOW_LIVE_SEND };
  for (const key of ENV_KEYS) snap[key] = env[key];
  return snap;
}

function restoreEnv(snap) {
  for (const key of ENV_KEYS) env[key] = snap[key];
  if (snap._allow === undefined) delete process.env.AFRICASTALKING_ALLOW_LIVE_SEND;
  else process.env.AFRICASTALKING_ALLOW_LIVE_SEND = snap._allow;
}

// Configure a non-production environment that has LIVE (non-sandbox) credentials.
function applyLocalLiveCreds() {
  env.nodeEnv = "development";
  env.africasTalkingUsername = "live-account"; // any non-"sandbox" value = live creds
  env.africasTalkingApiKey = "test-key-not-real";
  env.africasTalkingEnv = "production"; // non-sandbox => "live" credentials
}

test("normalizePhoneNumber converts supported Uganda formats to +256E.164", () => {
  assert.equal(normalizePhoneNumber("0772123456"), "+256772123456");
  assert.equal(normalizePhoneNumber("256772123456"), "+256772123456");
  assert.equal(normalizePhoneNumber("+256772123456"), "+256772123456");
});

test("normalizePhoneNumber rejects invalid numbers with an empty string", () => {
  assert.equal(normalizePhoneNumber("12345"), "");
  assert.equal(normalizePhoneNumber(""), "");
  assert.equal(normalizePhoneNumber("not-a-number"), "");
  assert.equal(normalizePhoneNumber(null), "");
});

test("maskPhone never exposes a full Uganda recipient", () => {
  const phone = "+256772123456";
  const masked = maskPhone(phone);
  assert.equal(masked, "+2567***56");
  assert.ok(!masked.includes("772123456"));
});

test("sanitizeSmsLogText redacts recipients and common secret fields", () => {
  const safe = sanitizeSmsLogText("to=+256772123456 apiKey=secret-value Authorization=Bearer-token token=abc123");
  assert.ok(!safe.includes("772123456"));
  assert.ok(!safe.includes("secret-value"));
  assert.ok(!safe.includes("Bearer-token"));
  assert.ok(!safe.includes("abc123"));
});

test("sendSms mock mode returns a success-shaped response without calling Africa's Talking", async () => {
  const snap = snapshotEnv();
  applyLocalLiveCreds();
  env.smsEnabled = true; // these tests exercise the send mechanics (SMS enabled)
  delete process.env.AFRICASTALKING_ALLOW_LIVE_SEND; // default => mock in dev

  const originalInfo = logger.info;
  const calls = [];
  logger.info = (obj, msg) => {
    calls.push({ obj, msg });
  };

  // Body intentionally contains a fake OTP so we can prove it is never logged.
  const otp = "654321";
  const body = `Your Queless verification code is ${otp}. It expires in 10 minutes.`;

  try {
    assert.equal(getSmsConfig().mock, true);

    const result = await sendSms({ to: "0772123456", message: body, metadata: { source: "otp" } });

    // Success-shaped mock response, clearly not from the real provider.
    assert.equal(result.mock, true);
    assert.equal(result.to, "+256772123456");
    assert.equal(result.response.SMSMessageData.Recipients[0].status, "Success");
    assert.match(String(result.response.SMSMessageData.Recipients[0].messageId), /^mock-/);

    // Exactly one mock-mode log line, and it carries only safe metadata.
    const smsLog = calls.find((entry) => /mock mode/i.test(entry.msg || ""));
    assert.ok(smsLog, "expected a mock-mode log line");
    assert.deepEqual(Object.keys(smsLog.obj).sort(), ["length", "source", "to"]);
    assert.equal(smsLog.obj.source, "otp");
    assert.equal(smsLog.obj.length, body.length);
    // Phone is masked: the full subscriber digits must not appear.
    assert.ok(!String(smsLog.obj.to).includes("772123456"), "recipient must be masked");

    // The OTP code and full body must never appear in any captured log.
    const serialized = JSON.stringify(calls);
    assert.ok(!serialized.includes(otp), "OTP code must not be logged");
    assert.ok(!serialized.includes(body), "full message body must not be logged");
  } finally {
    logger.info = originalInfo;
    restoreEnv(snap);
  }
});

test("real-send gate: dev only leaves mock mode when AFRICASTALKING_ALLOW_LIVE_SEND=true", () => {
  const snap = snapshotEnv();
  try {
    applyLocalLiveCreds();

    delete process.env.AFRICASTALKING_ALLOW_LIVE_SEND;
    assert.equal(getSmsConfig().mock, true, "dev + live creds defaults to mock");

    process.env.AFRICASTALKING_ALLOW_LIVE_SEND = "true";
    assert.equal(getSmsConfig().mock, false, "explicit opt-in allows real local sends");
  } finally {
    restoreEnv(snap);
  }
});

test("SMS disabled (Coming Soon) gate: sendSms refuses to send and never contacts the provider", async () => {
  const snap = snapshotEnv();
  applyLocalLiveCreds();
  env.smsEnabled = false; // master kill switch off => Coming Soon
  process.env.AFRICASTALKING_ALLOW_LIVE_SEND = "true"; // even with live opt-in, must not send

  const originalInfo = logger.info;
  const calls = [];
  logger.info = (obj, msg) => calls.push({ obj, msg });

  try {
    await assert.rejects(
      () => sendSms({ to: "0772123456", message: "Your code is 999111.", metadata: { source: "otp" } }),
      (error) => {
        assert.equal(error.statusCode, 503);
        assert.equal(error.code, "SMS_DISABLED");
        return true;
      }
    );
    // Disabled log carries only masked metadata; the OTP/body is never logged.
    const serialized = JSON.stringify(calls);
    assert.ok(!serialized.includes("999111"), "OTP code must not be logged");
    assert.ok(!serialized.includes("772123456"), "recipient must be masked");
  } finally {
    logger.info = originalInfo;
    restoreEnv(snap);
  }
});

test("real-send gate: production with AFRICASTALKING_ENV=production is never mocked", () => {
  const snap = snapshotEnv();
  try {
    env.nodeEnv = "production";
    env.africasTalkingUsername = "live-account";
    env.africasTalkingApiKey = "test-key-not-real";
    env.africasTalkingEnv = "production";
    delete process.env.AFRICASTALKING_ALLOW_LIVE_SEND;

    assert.equal(getSmsConfig().mock, false);
  } finally {
    restoreEnv(snap);
  }
});

test("sandbox credentials in dev use the real sandbox simulator (not mock)", () => {
  const snap = snapshotEnv();
  try {
    env.nodeEnv = "development";
    env.africasTalkingUsername = "sandbox";
    env.africasTalkingApiKey = "test-key-not-real";
    env.africasTalkingEnv = "sandbox";
    delete process.env.AFRICASTALKING_ALLOW_LIVE_SEND;

    assert.equal(getSmsConfig().mock, false);
  } finally {
    restoreEnv(snap);
  }
});

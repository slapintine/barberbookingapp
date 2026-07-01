import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "queless-audit-unit-"));
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "audit-unit-test-secret-at-least-32-characters";
process.env.AUDIT_LOG_SALT = "unit-test-salt";
process.env.DB_CLIENT = "sqlite";
process.env.DB_PATH = path.join(tempDir, "audit-unit.sqlite");

const { sanitizeAuditMetadata, hashAuditEmail, recordAuditEvent } = await import("./auditLogService.js");

test("sanitize redacts secret-bearing keys but keeps safe fields", () => {
  const out = sanitizeAuditMetadata({
    password: "hunter2",
    newPassword: "hunter3",
    token: "abc.def.ghi",
    refreshToken: "r-token",
    accessToken: "a-token",
    otp: "123456",
    apiKey: "sk-live-xyz",
    authorization: "Bearer xxx",
    cardNumber: "4111111111111111",
    plan: "PREMIUM",
    status: "active",
    note: "ok",
  });
  for (const key of ["password", "newPassword", "token", "refreshToken", "accessToken", "otp", "apiKey", "authorization", "cardNumber"]) {
    assert.equal(out[key], "[redacted]", `${key} must be redacted`);
  }
  assert.equal(out.plan, "PREMIUM");
  assert.equal(out.status, "active");
  assert.equal(out.note, "ok");
  const blob = JSON.stringify(out);
  assert.ok(!/hunter2|hunter3|123456|sk-live-xyz|Bearer xxx|4111111111111111|r-token|a-token/.test(blob), "no raw secret values may survive");
});

test("sanitize redacts nested secrets and caps long strings", () => {
  // A secret-bearing key ("auth") redacts its whole subtree, and a plain nested
  // token is redacted too.
  const out = sanitizeAuditMetadata({ outer: { sessionToken: "deep-secret" }, auth: { foo: "bar" }, big: "x".repeat(5000) });
  assert.equal(out.outer.sessionToken, "[redacted]");
  assert.equal(out.auth, "[redacted]");
  assert.ok(out.big.length <= 301);
  assert.ok(!JSON.stringify(out).includes("deep-secret"));
});

test("hashAuditEmail never returns the plain email and is case-insensitive", () => {
  const h1 = hashAuditEmail("Person@Example.TEST");
  const h2 = hashAuditEmail("person@example.test");
  assert.equal(h1, h2);
  assert.ok(h1 && !h1.includes("@") && !/person/i.test(h1));
});

test("recordAuditEvent is best-effort: a write failure never throws", async () => {
  // No initDb here, so the security_audit_logs table does not exist. The service
  // must swallow the insert error and resolve to null rather than rejecting.
  const result = await recordAuditEvent({ eventType: "test.event", metadata: { password: "x" } });
  assert.equal(result, null);
});

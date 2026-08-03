import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(new URL("../db/migrations/postgres/037_auth_sessions.sql", import.meta.url), "utf8");
const middleware = fs.readFileSync(new URL("../middleware/authMiddleware.js", import.meta.url), "utf8");
const sessionService = fs.readFileSync(new URL("./authSessionService.js", import.meta.url), "utf8");
const authController = fs.readFileSync(new URL("../controllers/authController.js", import.meta.url), "utf8");

test("auth sessions persist hashed refresh tokens and support revocation", () => {
  assert.match(migration, /refresh_token_hash TEXT NOT NULL UNIQUE/);
  assert.match(migration, /revoked_at TIMESTAMP DEFAULT NULL/);
  assert.match(middleware, /authenticateAccessToken/);
  assert.match(sessionService, /WHERE id = \? AND refresh_token_hash = \? AND revoked_at IS NULL/);
});

test("auth SQL avoids SQLite-only boolean coalesce predicates", () => {
  const authSql = `${authController}\n${sessionService}`;
  assert.doesNotMatch(
    authSql,
    /COALESCE\s*\(\s*bs\.is_active\s*,\s*0\s*\)\s*=\s*1/i,
    "PostgreSQL rejects COALESCE(boolean, integer); auth SQL must use a cross-database boolean predicate."
  );
});

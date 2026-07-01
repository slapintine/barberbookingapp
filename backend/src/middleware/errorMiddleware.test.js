import test from "node:test";
import assert from "node:assert/strict";
import { errorHandler } from "./errorMiddleware.js";

function mockReqRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  const req = { id: "req-test", log: { error() {} } };
  return { req, res };
}

function withProductionEnv(run) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    run();
  } finally {
    process.env.NODE_ENV = previous;
  }
}

test("validation errors keep their helpful message in production", () => {
  withProductionEnv(() => {
    const { req, res } = mockReqRes();
    const err = Object.assign(new Error("Business name and location are required."), { statusCode: 400 });
    errorHandler(err, req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Business name and location are required.");
    assert.equal(res.body.success, false);
    assert.equal(res.body.requestId, "req-test");
  });
});

test("intentional app codes with underscores are forwarded to the client", () => {
  withProductionEnv(() => {
    const { req, res } = mockReqRes();
    const err = Object.assign(new Error("Your draft is saved, but complete business phone before publishing."), {
      statusCode: 400,
      code: "STAND_NOT_READY",
    });
    errorHandler(err, req, res, () => {});
    assert.equal(res.body.code, "STAND_NOT_READY");
  });
});

test("filesystem storage failures become a retry-able 503, never a generic 500", () => {
  withProductionEnv(() => {
    const { req, res } = mockReqRes();
    const err = Object.assign(new Error("EACCES: permission denied, mkdir '/var/www/uploads'"), { code: "EACCES" });
    errorHandler(err, req, res, () => {});
    assert.equal(res.statusCode, 503);
    assert.match(res.body.message, /try again/i);
    // The raw OS errno code must never reach the client.
    assert.equal(res.body.code, undefined);
    // The raw filesystem path / errno message must never reach the client.
    assert.doesNotMatch(res.body.message, /EACCES|\/var\/www/);
  });
});

test("unexpected database errors stay generic and never leak driver codes", () => {
  withProductionEnv(() => {
    const { req, res } = mockReqRes();
    // Shape of a Postgres driver error (e.g. operator does not exist: text > timestamp).
    const err = Object.assign(new Error('operator does not exist: text > timestamp'), { code: "42883" });
    errorHandler(err, req, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, "Something went wrong on our side. Please try again shortly.");
    assert.equal(res.body.code, undefined);
    assert.doesNotMatch(res.body.message, /operator does not exist|timestamp/);
  });
});

test("a malformed id (Postgres 22P02) becomes a clean 400, never a 500 or raw SQL", () => {
  withProductionEnv(() => {
    const { req, res } = mockReqRes();
    // Shape of a Postgres invalid-text-representation error, e.g. a dash id "5-3"
    // or "NaN" reaching an integer column.
    const err = Object.assign(new Error('invalid input syntax for type integer: "NaN"'), { code: "22P02" });
    errorHandler(err, req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /weren't valid|check and try again/i);
    assert.doesNotMatch(res.body.message, /invalid input syntax|integer|NaN/);
    assert.equal(res.body.code, undefined);
  });
});

test("explicit publicMessage on a 5xx is preferred over the generic fallback", () => {
  withProductionEnv(() => {
    const { req, res } = mockReqRes();
    const err = Object.assign(new Error("internal detail"), {
      statusCode: 503,
      code: "IMAGE_STORAGE_UNAVAILABLE",
      publicMessage: "We saved your other details, but couldn't store your uploaded image just now.",
    });
    errorHandler(err, req, res, () => {});
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.message, "We saved your other details, but couldn't store your uploaded image just now.");
    assert.equal(res.body.code, "IMAGE_STORAGE_UNAVAILABLE");
  });
});

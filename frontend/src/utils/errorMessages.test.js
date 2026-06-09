import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeErrorMessage,
  looksLikeServerHtml,
  getFriendlyApiErrorMessage,
  SERVER_UNAVAILABLE_FALLBACK,
} from "./errorMessages.js";

// The exact body that leaked into the live login form.
const NGINX_502 =
  "<html> <head><title>502 Bad Gateway</title></head> <body> " +
  "<center><h1>502 Bad Gateway</h1></center> <hr><center>nginx/1.20.1</center> " +
  "</body> </html> <!-- a padding to disable MSIE and Chrome friendly error page -->";

test("nginx 502 HTML body is never surfaced to the UI", () => {
  const result = sanitizeErrorMessage(NGINX_502);
  assert.equal(result, SERVER_UNAVAILABLE_FALLBACK);
  // The sanitized output must not contain any of the raw-HTML / proxy markers.
  assert.doesNotMatch(result, /<html/i);
  assert.doesNotMatch(result, /<body/i);
  assert.doesNotMatch(result, /<center/i);
  assert.doesNotMatch(result, /nginx/i);
  assert.doesNotMatch(result, /502 Bad Gateway/i);
});

test("other server error pages are caught", () => {
  for (const body of [
    "<html><title>503 Service Temporarily Unavailable</title></html>",
    "<html><head><title>504 Gateway Time-out</title></head></html>",
    "nginx/1.20.1",
    "<!doctype html><body>Bad Gateway</body>",
  ]) {
    assert.equal(looksLikeServerHtml(body), true, `should flag: ${body}`);
    assert.equal(sanitizeErrorMessage(body), SERVER_UNAVAILABLE_FALLBACK);
  }
});

test("legitimate plain-text messages pass through unchanged", () => {
  for (const msg of [
    "Invalid login details. Please check your username/email and password.",
    "Passwords do not match.",
    "Too many attempts. Please wait a moment and try again.",
    "Your booking was created.",
  ]) {
    assert.equal(sanitizeErrorMessage(msg), msg);
    assert.equal(looksLikeServerHtml(msg), false);
  }
});

test("empty / nullish messages fall back to friendly copy", () => {
  assert.equal(sanitizeErrorMessage(""), SERVER_UNAVAILABLE_FALLBACK);
  assert.equal(sanitizeErrorMessage(null), SERVER_UNAVAILABLE_FALLBACK);
  assert.equal(sanitizeErrorMessage(undefined), SERVER_UNAVAILABLE_FALLBACK);
  assert.equal(sanitizeErrorMessage("   "), SERVER_UNAVAILABLE_FALLBACK);
});

test("a custom fallback can be supplied", () => {
  const fallback = "Could not log in. Please check your connection and try again.";
  assert.equal(sanitizeErrorMessage(NGINX_502, fallback), fallback);
});

test("getFriendlyApiErrorMessage maps status codes to friendly copy", () => {
  assert.match(getFriendlyApiErrorMessage(0), /internet connection/i);
  assert.match(getFriendlyApiErrorMessage(401), /invalid login/i);
  assert.match(getFriendlyApiErrorMessage(429), /too many attempts/i);
  assert.equal(getFriendlyApiErrorMessage(502), SERVER_UNAVAILABLE_FALLBACK);
  assert.equal(getFriendlyApiErrorMessage(500), SERVER_UNAVAILABLE_FALLBACK);
});

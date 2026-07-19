import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

test("dark mode recovery layer uses semantic readable tokens for text, forms, icons, and notifications", () => {
  const css = source("./styles/dark-mode-audit.css");

  assert.match(css, /--text-primary:\s*#fffaf5/);
  assert.match(css, /--text-secondary:\s*#e2d8e5/);
  assert.match(css, /--input-bg:\s*rgba\(255,\s*250,\s*245,\s*0\.09\)/);
  assert.match(css, /body\[data-theme="dark"\] \.app-wrap-v4\.dark :is\(\s*input,/);
  assert.match(css, /\.notif-card-title/);
  assert.match(css, /\.lineup-auth-password-toggle/);
  assert.match(css, /-webkit-text-fill-color:\s*var\(--text-primary\)/);
});

test("public root landing is services-only and does not redirect straight to the app", () => {
  const root = fs.readFileSync(new URL("../../deploy/public-root/index.html", import.meta.url), "utf8");

  assert.match(root, /Book local services/);
  assert.match(root, /Find a provider/);
  assert.match(root, /Pay the provider directly for now|customers pay providers directly/i);
  assert.match(root, /href="\/app\/services"/);
  assert.doesNotMatch(root, /http-equiv="refresh"/);
  assert.doesNotMatch(root, /Shop Products|Product marketplace|Services\s*\/\s*Products|Inventory|Cart|Checkout/);
});

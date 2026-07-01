import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const apiSource = fs.readFileSync(new URL("./api/barbersApi.js", import.meta.url), "utf8");
const routeSource = fs.readFileSync(
  new URL("../../backend/src/routes/barberRoutes.js", import.meta.url),
  "utf8"
);

test("frontend stand API paths match backend routes", () => {
  assert.match(apiSource, /apiFetch\("\/api\/barbers\/register"/);
  assert.match(routeSource, /router\.post\("\/register"/);
  assert.match(apiSource, /apiFetch\("\/api\/barbers\/me"/);
  assert.match(routeSource, /router\.patch\("\/me"/);
  assert.match(apiSource, /apiFetch\("\/api\/barbers\/me\/publish"/);
  assert.match(routeSource, /router\.post\("\/me\/publish"/);
});

test("draft update and publish remain separate HTTP operations", () => {
  assert.match(apiSource, /method:\s*"PATCH"/);
  assert.match(apiSource, /publishMyBarberStand\(\)[\s\S]*\/api\/barbers\/me\/publish[\s\S]*method:\s*"POST"/);
});

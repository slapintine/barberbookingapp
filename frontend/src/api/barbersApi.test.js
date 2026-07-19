import assert from "node:assert/strict";
import test from "node:test";

function makeStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || "",
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("provider discovery requests are deduplicated and briefly cached", async () => {
  globalThis.localStorage = makeStorage();
  globalThis.sessionStorage = makeStorage();
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response(JSON.stringify({ success: true, barbers: [{ id: requestCount, services: [] }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const { clearBarbersCache, getBarbers } = await import("./barbersApi.js");
  clearBarbersCache();

  const [first, second] = await Promise.all([getBarbers(), getBarbers()]);
  assert.equal(requestCount, 1);
  assert.deepEqual(first, second);

  const warm = await getBarbers();
  assert.equal(requestCount, 1);
  assert.deepEqual(warm, first);

  clearBarbersCache();
  await getBarbers();
  assert.equal(requestCount, 2);
});

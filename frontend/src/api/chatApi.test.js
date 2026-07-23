import assert from "node:assert/strict";
import test from "node:test";

function makeStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) || "",
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("conversation list requests are deduped, briefly cached, and invalidated after sending", async () => {
  globalThis.localStorage = makeStorage({ lineup_token: "token-user-one-abcdef123456" });
  globalThis.sessionStorage = makeStorage();
  let conversationsRequests = 0;
  let sendRequests = 0;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path.includes("/api/messages/conversations")) {
      conversationsRequests += 1;
      return new Response(JSON.stringify({ success: true, conversations: [{ id: `c-${conversationsRequests}` }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (path.endsWith("/api/messages")) {
      sendRequests += 1;
      assert.equal(options.method, "POST");
      return new Response(JSON.stringify({ id: sendRequests, text: "hello" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected request ${path}`);
  };

  const { createMessage, clearConversationsCache, getConversations } = await import("./chatApi.js");
  clearConversationsCache();

  const [first, second] = await Promise.all([getConversations(), getConversations()]);
  assert.equal(conversationsRequests, 1);
  assert.deepEqual(first, second);

  const warm = await getConversations();
  assert.equal(conversationsRequests, 1);
  assert.deepEqual(warm, first);

  await createMessage({ barberId: 1, customerUsername: "customer_one", text: "hello", clientMessageId: "msg-1" });
  await getConversations();
  assert.equal(sendRequests, 1);
  assert.equal(conversationsRequests, 2);
});

test("conversation cache is separated by authenticated account", async () => {
  globalThis.localStorage = makeStorage({ lineup_token: "token-user-one-abcdef123456" });
  globalThis.sessionStorage = makeStorage();
  let conversationsRequests = 0;
  globalThis.fetch = async () => {
    conversationsRequests += 1;
    return new Response(JSON.stringify({ success: true, conversations: [{ id: `account-${conversationsRequests}` }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const { clearConversationsCache, getConversations } = await import("./chatApi.js");
  clearConversationsCache();

  const first = await getConversations();
  globalThis.localStorage.setItem("lineup_token", "token-user-two-zzzzzz999999");
  const second = await getConversations();

  assert.equal(conversationsRequests, 2);
  assert.notDeepEqual(first, second);
});

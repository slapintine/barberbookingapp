import test from "node:test";
import assert from "node:assert/strict";
import { getBookingPriceCardParts } from "./bookingPricing.js";

test("booking price card shows the same fixed total used by the booking summary", () => {
  const parts = getBookingPriceCardParts(
    { pricing_type: "fixed", price_extra: 27000 },
    53000
  );

  assert.deepEqual(parts, { top: "UGX", bottom: "53,000" });
});

test("booking price card keeps quote services as quote required", () => {
  const parts = getBookingPriceCardParts(
    { pricing_type: "quote", price_extra: 0 },
    0
  );

  assert.deepEqual(parts, { top: "Quote", bottom: "required", quote: true });
});

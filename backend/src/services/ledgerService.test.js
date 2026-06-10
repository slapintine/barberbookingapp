import test from "node:test";
import assert from "node:assert/strict";
import { getBarberWalletSnapshot } from "./ledgerService.js";

test("provider wallet snapshot allows zero balances", async () => {
  const wallet = {
    id: 1,
    barber_id: 42,
    pending_balance: 0,
    available_balance: 0,
    locked_balance: 0,
    total_earned: 0,
    withdrawn_total: 0,
  };
  const client = {
    async get() {
      return wallet;
    },
    async all() {
      return [];
    },
  };

  const snapshot = await getBarberWalletSnapshot(42, client);

  assert.deepEqual(snapshot.wallet, wallet);
  assert.deepEqual(snapshot.transactions, []);
  assert.deepEqual(snapshot.withdrawals, []);
});

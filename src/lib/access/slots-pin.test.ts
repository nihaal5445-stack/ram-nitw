import test from "node:test";
import assert from "node:assert/strict";
import { slotAt, istParts, ledgerKey, type SlotWindow } from "./slots.ts";
import { wrapWithPin, unwrapWithPin } from "./pin-vault.ts";

const SLOTS: SlotWindow[] = [
  { slot: "breakfast", starts: "07:30", ends: "09:30" },
  { slot: "lunch", starts: "12:00", ends: "14:00" },
  { slot: "dinner", starts: "19:30", ends: "21:30" },
];
// IST = UTC+5:30. 13:15 IST on 6 Nov 2026 = 07:45 UTC.
const LUNCH = Date.UTC(2026, 10, 6, 7, 45);

test("IST date and minutes", () => {
  assert.deepEqual(istParts(LUNCH), { date: "2026-11-06", minutes: 13 * 60 + 15 });
  // 20:00 UTC on the 6th is 01:30 IST on the 7th: the IST date rolls over before UTC's.
  assert.equal(istParts(Date.UTC(2026, 10, 6, 20, 0)).date, "2026-11-07");
});

test("slot lookup with grace, and none between meals", () => {
  assert.deepEqual(slotAt(SLOTS, LUNCH), { slot: "lunch", date: "2026-11-06" });
  assert.equal(slotAt(SLOTS, Date.UTC(2026, 10, 6, 5, 30))?.slot, undefined, "11:00 IST is between meals");
  assert.equal(slotAt(SLOTS, Date.UTC(2026, 10, 6, 8, 40), 15)?.slot, "lunch", "14:10 IST is inside the 15 min grace");
  assert.equal(slotAt(SLOTS, Date.UTC(2026, 10, 6, 9, 0), 15), null, "14:30 IST is outside");
});

test("ledger key is per student, IST date and slot", () => {
  assert.notEqual(ledgerKey("s1", "2026-11-06", "lunch"), ledgerKey("s1", "2026-11-06", "dinner"));
  assert.notEqual(ledgerKey("s1", "2026-11-06", "lunch"), ledgerKey("s1", "2026-11-07", "lunch"));
  assert.notEqual(ledgerKey("s1", "2026-11-06", "lunch"), ledgerKey("s2", "2026-11-06", "lunch"));
});

test("PIN wrap round trip; wrong PIN and tampering fail", async () => {
  const data = new TextEncoder().encode(JSON.stringify({ students: ["a", "b"] }));
  const w = await wrapWithPin("482913", data, 1000); // low iteration count only to keep the test fast
  assert.deepEqual(await unwrapWithPin("482913", w), data);
  assert.equal(await unwrapWithPin("000000", w), null);
  assert.equal(await unwrapWithPin("482913", { ...w, ct: w.ct.slice(0, -2) + (w.ct.endsWith("AA") ? "BB" : "AA") }), null);
  const w2 = await wrapWithPin("482913", data, 1000);
  assert.notEqual(w.salt, w2.salt);
  assert.notEqual(w.ct, w2.ct);
});

test("DEMO MODE: any time is inside an open slot (containing window, else the nearest)", () => {
  // 23:00 IST: real rules say no slot, demo mode picks the nearest (dinner ends 21:30)
  const NIGHT = Date.UTC(2026, 10, 6, 17, 30);
  assert.equal(slotAt(SLOTS, NIGHT), null);
  assert.equal(slotAt(SLOTS, NIGHT, 15, true)?.slot, "dinner");
  // 05:00 IST: nearest is breakfast (starts 07:30)
  assert.equal(slotAt(SLOTS, Date.UTC(2026, 10, 5, 23, 30), 15, true)?.slot, "breakfast");
  // inside lunch: the containing window wins, demo or not
  assert.equal(slotAt(SLOTS, LUNCH, 15, true)?.slot, "lunch");
  assert.equal(slotAt(SLOTS, LUNCH)?.slot, "lunch");
});

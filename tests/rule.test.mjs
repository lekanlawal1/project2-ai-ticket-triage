import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "../site/rule.js";

const ai = (o) => ({ team: "fraud", confidence: 0.95, evidenceFound: true, ...o });

test("straight to the team only when both agree, the AI is sure and its quote checks out", () => {
  assert.deepEqual(decide("fraud", ai()), { route: "fraud", why: [] });
});
test("every reason to hold a message is given, not just the first", () => {
  const d = decide("cards", ai({ confidence: 0.6, evidenceFound: false }));
  assert.equal(d.route, "human");
  assert.equal(d.why.length, 3);
});
test("exactly 80% sure is enough; anything less isn't", () => {
  assert.equal(decide("fraud", ai({ confidence: 0.8 })).route, "fraud");
  assert.equal(decide("fraud", ai({ confidence: 0.79 })).route, "human");
});
test("no AI answer means a person checks it", () => {
  assert.equal(decide("fraud", null).route, "human");
});

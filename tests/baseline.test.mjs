import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load, predict } from "../site/baseline.js";

const model = load(JSON.parse(readFileSync(new URL("../site/data/baseline.json", import.meta.url))));
const python = JSON.parse(readFileSync(new URL("./baseline_parity.json", import.meta.url)));

test("the browser model gives Python's answer on all 3,080 test messages", () => {
  let same = 0, worst = 0;
  for (const r of python) {
    const top = predict(model, r.text)[0];
    if (top.team === r.team) same++;
    worst = Math.max(worst, Math.abs(top.p - r.p));
  }
  assert.equal(same, python.length, `${python.length - same} messages got a different team`);
  assert.ok(worst < 0.01, `probabilities drift by up to ${worst}`);
});

test("an empty or unknown message still returns every team, summing to 1", () => {
  for (const t of ["", "zzzz qqqq"]) {
    const out = predict(model, t);
    assert.equal(out.length, 7);
    assert.ok(Math.abs(out.reduce((s, o) => s + o.p, 0) - 1) < 1e-9);
  }
});

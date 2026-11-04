// Scores the 770-message sample with the same code the page runs (site/baseline.js, site/rule.js)
// and writes site/data/results.json (the numbers) and site/data/inbox.json (every message, both
// opinions, the decision and the right answer) for the "run the inbox" demo.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { load, predict } from "../site/baseline.js";
import { decide, MIN_CONFIDENCE } from "../site/rule.js";
import { MODEL, PROMPT_VERSION } from "../worker/src/triage.js";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const model = load(read("../site/data/baseline.json"));
const sample = read("../data/eval_sample.json");
const resultsPath = new URL("../data/gemini_results.jsonl", import.meta.url);
const ai = new Map(existsSync(resultsPath) ? readFileSync(resultsPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => r.prompt === PROMPT_VERSION && r.model === MODEL).map((r) => [r.id, r]) : []);

const rows = sample.map((s) => {
  const b = predict(model, s.text)[0], a = ai.get(s.id) || null;
  const d = decide(b.team, a);
  return { id: s.id, text: s.text, intent: s.intent, team: s.team, priority: s.priority,
    baseline: { team: b.team, p: +b.p.toFixed(3) },
    ai: a && { team: a.team, priority: a.priority, confidence: a.confidence, evidence: a.evidence, evidenceFound: a.evidenceFound, reason: a.reason },
    route: d.route, why: d.why };
});
const scored = rows.filter((r) => r.ai);
const pct = (n, d) => d ? +(100 * n / d).toFixed(1) : null;
const count = (xs, f) => xs.filter(f).length;
const auto = scored.filter((r) => r.route !== "human");
const confOnly = scored.filter((r) => r.ai.confidence >= MIN_CONFIDENCE);
const buckets = [[0, 0.5], [0.5, 0.8], [0.8, 0.9], [0.9, 0.95], [0.95, 1.01]].map(([lo, hi]) => {
  const xs = scored.filter((r) => r.ai.confidence >= lo && r.ai.confidence < hi);
  return { from: lo, to: Math.min(hi, 1), n: xs.length, correct: pct(count(xs, (r) => r.ai.team === r.team), xs.length) };
});
const teams = [...new Set(sample.map((s) => s.team))];
const confusions = {};
for (const r of scored) if (r.ai.team !== r.team) { const k = `${r.team}>${r.ai.team}`; confusions[k] = (confusions[k] || 0) + 1; }
const urgent = scored.filter((r) => r.priority === "urgent");

const results = {
  model: MODEL, prompt: PROMPT_VERSION, threshold: MIN_CONFIDENCE, sample: rows.length, scored: scored.length,
  baseline: { correct: pct(count(rows, (r) => r.baseline.team === r.team), rows.length), testAccuracyAll: model.test_accuracy },
  ai: scored.length ? {
    correct: pct(count(scored, (r) => r.ai.team === r.team), scored.length),
    evidenceFound: pct(count(scored, (r) => r.ai.evidenceFound), scored.length),
    priorityExact: pct(count(scored, (r) => r.ai.priority === r.priority), scored.length),
    urgentCaught: pct(count(urgent, (r) => r.ai.priority === "urgent"), urgent.length),
  } : null,
  agree: scored.length ? { rate: pct(count(scored, (r) => r.ai.team === r.baseline.team), scored.length),
    correctWhenAgree: pct(count(scored, (r) => r.ai.team === r.baseline.team && r.ai.team === r.team), count(scored, (r) => r.ai.team === r.baseline.team)) } : null,
  decision: scored.length ? {
    autoRate: pct(auto.length, scored.length), autoCorrect: pct(count(auto, (r) => r.route === r.team), auto.length),
    autoWrong: count(auto, (r) => r.route !== r.team), humanRate: pct(scored.length - auto.length, scored.length),
  } : null,
  confidenceOnly: scored.length ? { autoRate: pct(confOnly.length, scored.length), autoWrong: count(confOnly, (r) => r.ai.team !== r.team) } : null,
  calibration: buckets,
  perTeam: teams.map((t) => { const xs = scored.filter((r) => r.team === t), all = rows.filter((r) => r.team === t);
    return { team: t, n: all.length, ai: pct(count(xs, (r) => r.ai.team === t), xs.length), baseline: pct(count(all, (r) => r.baseline.team === t), all.length) }; }),
  confusions: Object.entries(confusions).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => ({ from: k.split(">")[0], to: k.split(">")[1], n })),
};
writeFileSync(new URL("../site/data/results.json", import.meta.url), JSON.stringify(results, null, 1));
writeFileSync(new URL("../site/data/inbox.json", import.meta.url), JSON.stringify(rows));
console.log(JSON.stringify({ scored: results.scored, baseline: results.baseline, ai: results.ai, decision: results.decision, confidenceOnly: results.confidenceOnly }, null, 1));

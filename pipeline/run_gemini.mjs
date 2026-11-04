// The scoring run: sends each sampled message to Gemini through the same code the live demo uses
// (worker/src/triage.js) and appends the answers to data/gemini_results.jsonl. It picks up where it
// left off, so the free tier's daily limit just means finishing tomorrow.
//   GEMINI_API_KEY=... node pipeline/run_gemini.mjs [max messages this run]
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { askGemini, MODEL, PROMPT_VERSION } from "../worker/src/triage.js";

const key = process.env.GEMINI_API_KEY?.trim();
if (!key) { console.error("Set GEMINI_API_KEY"); process.exit(1); }
const OUT = new URL("../data/gemini_results.jsonl", import.meta.url);
const sample = JSON.parse(readFileSync(new URL("../data/eval_sample.json", import.meta.url)));
const done = new Set(existsSync(OUT) ? readFileSync(OUT, "utf8").trim().split("\n").filter(Boolean)
  .map((l) => JSON.parse(l)).filter((r) => r.prompt === PROMPT_VERSION && r.model === MODEL).map((r) => r.id) : []);
const todo = sample.filter((r) => !done.has(r.id)).slice(0, Number(process.argv[2]) || Infinity);
const gap = 60000 / (Number(process.env.GEMINI_RPM) || 9);       // stay under the per-minute limit
console.log(`${done.size} already scored, ${todo.length} to go`);
let failures = 0;
for (const r of todo) {
  const t0 = Date.now();
  try {
    const a = await askGemini(key, r.text);
    appendFileSync(OUT, JSON.stringify({ id: r.id, ...a, model: MODEL, prompt: PROMPT_VERSION }) + "\n");
    failures = 0;
  } catch (err) {
    console.log(`#${r.id}: ${err.message}`);
    if (/HTTP 429/.test(err.message) && ++failures >= 3) { console.log("Daily limit reached: stopping here, run again later."); break; }
  }
  await new Promise((res) => setTimeout(res, Math.max(0, gap - (Date.now() - t0))));
}

// "Your messages": the same method as the Banking77 demo, on a visitor's own teams and history.
// The file is read here, the plain model is trained here, and only a sample of up to 200 messages
// (with personal details hidden) goes to the AI. The decision rule is the demo's own rule.js.
import { parse, guessColumns, toCSV } from "./csv.js";
import { redact } from "./redact.js";
import { train, shuffle, seeded } from "./train.js";
import { load, predict } from "./baseline.js";
import { decide, MIN_CONFIDENCE } from "./rule.js";

const API = (window.TRIAGE_API || "https://ticket-triage.lekanlawal.workers.dev") + "/triage-batch";
const MAX_ROWS = 5000, MAX_SAMPLE = 200, BATCH = 10, MAX_TEAMS = 12;
const COLOURS = ["#2F6BFF", "#00A372", "#E8A500", "#8B4DFF", "#F26B00", "#0096B4", "#F0352A", "#D6409F", "#6B7A00", "#8A5A3C", "#3949AB", "#00897B"];
const CHECK = '<svg class="ic" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.2 6.4l2.4 2.4 5.2-5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROSS = '<svg class="ic" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M3.2 3.2l5.6 5.6M8.8 3.2L3.2 8.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const BANK = [
  ["Cards", "ordering, delivering, activating and using cards (physical, virtual, disposable), PINs, Apple Pay and Google Pay, card payments that were declined, are pending or were reverted, refunds, and payments charged twice."],
  ["Transfers", "sending and receiving bank transfers, beneficiaries, transfers that are pending, failed, declined or cancelled, money that hasn't arrived, and how long transfers take."],
  ["Top-ups", "adding money to the account by card, bank transfer, cash or cheque, automatic top-ups, limits, and top-ups that are pending, failed, reverted or not showing in the balance."],
  ["Cash and ATMs", "cash withdrawals that were declined or are pending, an ATM that kept the card, and receiving the wrong amount of cash."],
  ["Fees and exchange", "any fee or extra charge (card payments, cash withdrawals, top-ups, transfers), exchange rates, exchanging currencies in the app, and which currencies are held."],
  ["Account and identity", "verifying identity or source of funds, personal details, passcodes, age limits, supported countries, and closing the account."],
  ["Fraud and security", "payments, withdrawals or direct debits the customer doesn't recognise, a card that may be compromised, and a lost or stolen card or phone."],
];
const BANK_IDS = { cards: "Cards", transfers: "Transfers", top_ups: "Top-ups", cash: "Cash and ATMs", fees_fx: "Fees and exchange", account: "Account and identity", fraud: "Fraud and security" };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (x, d = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "n/a");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

const S = { header: [], rows: [], colMsg: 0, colTeam: -1, teams: [], plan: null, results: null, stop: false, source: "" };

// ------------------------------------------------------------------ 1. messages
function loadText(text, source) {
  const parsed = parse(text);
  if (!parsed.length) { $("cols").hidden = false; $("cols").innerHTML = `<p class="warn">That file looks empty.</p>`; return; }
  const oneCol = parsed.every((r) => r.length === 1);
  S.header = oneCol ? ["Message"] : parsed[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  S.rows = (oneCol ? parsed : parsed.slice(1)).slice(0, MAX_ROWS);
  const g = guessColumns(S.header, S.rows);
  S.colMsg = g.message; S.colTeam = g.team; S.source = source;
  renderCols(); teamsFromFile(); show(2);
}
$("file").addEventListener("change", async (e) => { const f = e.target.files[0]; if (f) loadText(await f.text(), f.name); });
$("use-paste").addEventListener("click", () => { if ($("pasted").value.trim()) loadText($("pasted").value, "pasted text"); });
$("sample").addEventListener("click", async () => {
  const inbox = await (await fetch("data/inbox.json")).json();
  const csv = toCSV([["message", "team"], ...inbox.map((r) => [r.text, BANK_IDS[r.team]])]);
  S.teams = [];   // the sample comes with the bank's seven teams, descriptions and all
  loadText(csv, "770 Banking77 test messages");
  S.teams = BANK.map(([name, description]) => ({ name, description, from: name.toLowerCase() }));
  fixIds(); renderTeams(); refresh();
});

function renderCols() {
  const opts = (sel, none) => (none ? `<option value="-1"${S.colTeam === -1 ? " selected" : ""}>No team column</option>` : "") +
    S.header.map((h, i) => `<option value="${i}"${i === sel ? " selected" : ""}>${esc(h)}</option>`).join("");
  const preview = S.rows.slice(0, 3).map((r) => `<li><span>${esc(r[S.colMsg])}</span>${S.colTeam >= 0 ? `<em>${esc(r[S.colTeam])}</em>` : ""}</li>`).join("");
  $("cols").hidden = false;
  $("cols").innerHTML = `<p class="loaded"><b>${S.rows.length.toLocaleString("en-CA")}</b> messages from ${esc(S.source)}${S.rows.length >= MAX_ROWS ? " (the first 5,000)" : ""}.</p>
    <div class="selects"><label>Message column<select id="c-msg">${opts(S.colMsg)}</select></label>
      <label>Team it went to (optional)<select id="c-team">${opts(S.colTeam, true)}</select></label></div>
    <ol class="preview">${preview}</ol>`;
  $("c-msg").addEventListener("change", (e) => { S.colMsg = +e.target.value; renderCols(); refresh(); });
  $("c-team").addEventListener("change", (e) => { S.colTeam = +e.target.value; renderCols(); teamsFromFile(); });
}

// ------------------------------------------------------------------ 2. teams
// With a team column, the teams start as the values in it (the 12 most common); descriptions
// written before for the same team are remembered in this browser.
function teamsFromFile() {
  if (S.colTeam < 0) { if (!S.teams.length) S.teams = (store.get("sorted-own-teams") || []).slice(0, MAX_TEAMS); fixIds(); renderTeams(); refresh(); return; }
  const count = new Map();
  for (const r of S.rows) { const v = String(r[S.colTeam] || "").trim(); if (v) count.set(v, (count.get(v) || 0) + 1); }
  const saved = new Map((store.get("sorted-own-teams") || []).map((t) => [t.from || t.name.toLowerCase(), t.description]));
  const keep = new Map(S.teams.map((t) => [t.from, t.description]));
  S.teams = [...count].sort((a, b) => b[1] - a[1]).slice(0, MAX_TEAMS)
    .map(([v]) => ({ name: v.slice(0, 40), from: v.toLowerCase(), description: keep.get(v.toLowerCase()) || saved.get(v.toLowerCase()) || "" }));
  S.extraValues = count.size > MAX_TEAMS ? count.size - MAX_TEAMS : 0;
  fixIds(); renderTeams(); refresh();
}
function fixIds() {
  const used = new Set();
  for (const t of S.teams) {
    let id = (t.name || "team").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20) || "team";
    let k = id, n = 2; while (used.has(k)) k = `${id.slice(0, 18)}_${n++}`;
    used.add(k); t.id = k;
  }
  S.teams.forEach((t, i) => { t.colour = COLOURS[i % COLOURS.length]; });
}
function counts() {
  const c = new Map();
  if (S.colTeam >= 0) for (const r of S.rows) { const v = String(r[S.colTeam] || "").trim().toLowerCase(); if (v) c.set(v, (c.get(v) || 0) + 1); }
  return c;
}
function renderTeams() {
  const c = counts();
  $("teams").innerHTML = S.teams.map((t, i) => `<li style="--c:${t.colour}">
      <span class="sw" aria-hidden="true"></span>
      <div class="tf"><input aria-label="Team name" maxlength="40" value="${esc(t.name)}" data-i="${i}" data-k="name" placeholder="Team name">
        <input aria-label="What ${esc(t.name || "this team")} handles" maxlength="220" value="${esc(t.description)}" data-i="${i}" data-k="description" placeholder="What this team handles, in one line"></div>
      ${S.colTeam >= 0 ? `<span class="cnt">${(c.get(t.from) || 0).toLocaleString("en-CA")}</span>` : ""}
      <button type="button" class="x" data-del="${i}" aria-label="Remove ${esc(t.name || "this team")}">${CROSS}</button></li>`).join("");
  const warn = [];
  if (S.teams.length < 2) warn.push("Add at least two teams.");
  if (S.extraValues) warn.push(`Your file has ${S.extraValues} more team${S.extraValues > 1 ? "s" : ""} beyond the 12 most common; their messages are left out.`);
  if (S.teams.some((t) => !t.description)) warn.push("Teams without a description are harder for the AI: it only has the name to go on.");
  $("team-warn").hidden = !warn.length; $("team-warn").textContent = warn.join(" ");
  $("add-team").disabled = S.teams.length >= MAX_TEAMS;
}
$("teams").addEventListener("input", (e) => {
  const el = e.target.closest("[data-k]"); if (!el) return;
  const t = S.teams[+el.dataset.i]; t[el.dataset.k] = el.value;
  if (el.dataset.k === "name" && S.colTeam < 0) t.from = el.value.toLowerCase();
  fixIds(); save(); refresh();
});
$("teams").addEventListener("change", () => renderTeams());
$("teams").addEventListener("click", (e) => { const b = e.target.closest("[data-del]"); if (!b) return; S.teams.splice(+b.dataset.del, 1); fixIds(); save(); renderTeams(); refresh(); });
$("add-team").addEventListener("click", () => { S.teams.push({ name: "", description: "", from: "" }); fixIds(); renderTeams(); $("teams").lastElementChild.querySelector("input").focus(); });
$("bank-teams").addEventListener("click", () => { S.teams = BANK.map(([name, description]) => ({ name, description, from: name.toLowerCase() })); fixIds(); save(); renderTeams(); refresh(); });
function save() { store.set("sorted-own-teams", S.teams.filter((t) => t.name).map(({ name, description, from }) => ({ name, description, from }))); }

// ------------------------------------------------------------------ 3. the plan
function makePlan() {
  const byFrom = new Map(S.teams.map((t) => [t.from, t]));
  const items = S.rows.map((r) => {
    const text = String(r[S.colMsg] || "").replace(/\s+/g, " ").trim();
    const v = S.colTeam >= 0 ? String(r[S.colTeam] || "").trim().toLowerCase() : "";
    return { text, truth: v && byFrom.get(v) ? byFrom.get(v).id : null };
  }).filter((it) => it.text.length >= 3);
  const labelled = items.filter((it) => it.truth);
  const perTeam = new Map(S.teams.map((t) => [t.id, 0]));
  for (const it of labelled) perTeam.set(it.truth, perTeam.get(it.truth) + 1);
  const mode = labelled.length >= 40 && [...perTeam.values()].filter((n) => n >= 3).length >= 2 ? "labelled" : "plain";
  let sample, trainSet;
  if (mode === "labelled") {
    const shuffled = shuffle(labelled, seeded(7));
    const size = Math.min(MAX_SAMPLE, Math.max(20, Math.round(labelled.length * 0.25)));
    sample = shuffled.slice(0, size); trainSet = shuffled.slice(size);
  } else {
    sample = shuffle(items, seeded(7)).slice(0, MAX_SAMPLE); trainSet = [];
  }
  const hidden = { email: 0, link: 0, postcode: 0, number: 0 }, examples = [];
  for (const it of sample) {
    const r = redact(it.text); it.sent = r.text;
    for (const k in hidden) hidden[k] += r.counts[k];
    if (r.text !== it.text && examples.length < 2) examples.push(r.text);
  }
  const trainCount = new Map(S.teams.map((t) => [t.id, 0]));
  for (const it of trainSet) trainCount.set(it.truth, trainCount.get(it.truth) + 1);
  return { mode, items, labelled, sample, trainSet, hidden, examples, trainCount };
}
function refresh() {
  const ready = S.rows.length && S.teams.length >= 2 && S.teams.every((t) => t.name.trim());
  show(ready ? 3 : 2);
  if (!ready) return;
  const P = (S.plan = makePlan());
  const thin = S.teams.filter((t) => P.mode === "labelled" && P.trainCount.get(t.id) < 8);
  const batches = Math.ceil(P.sample.length / BATCH), mins = Math.max(1, Math.round((batches * 6) / 60));
  const h = P.hidden, hid = [["email", "email address"], ["number", "long number"], ["link", "link"], ["postcode", "postcode"]]
    .filter(([k]) => h[k]).map(([k, w]) => `${h[k]} ${w}${h[k] > 1 ? "es".slice(w.endsWith("s") ? 0 : 1) : ""}`).join(", ");
  $("plan").innerHTML = (P.mode === "labelled"
    ? `<div class="mode ok"><b>Scored against your own answers.</b> ${P.labelled.length.toLocaleString("en-CA")} messages have a team. The plain model learns
       from ${P.trainSet.length.toLocaleString("en-CA")} of them in this browser; both opinions are then scored on the other ${P.sample.length}, which the plain model never sees.</div>`
    : `<div class="mode"><b>No answers to score against.</b> ${S.colTeam < 0 ? "Your file has no team column" : "Too few messages have one of these teams"}, so Sorted can show what it would
       have done, but not how often it's right. The plain model only has your team descriptions to learn from, so it's weak, and more messages will be held for a person.
       Add a column with the team each message went to (40 or more) for a real score.</div>`) +
    (thin.length ? `<p class="warn">Few examples for ${thin.map((t) => `<b>${esc(t.name)}</b> (${P.trainCount.get(t.id)})`).join(", ")}: the plain model will be unsure there, so more of their messages will be held.</p>` : "") +
    `<div class="sent"><b>Sent to the AI:</b> ${P.sample.length} messages, in ${batches} batches of up to ${BATCH} (about ${mins} minute${mins > 1 ? "s" : ""}).
     ${hid ? `Hidden first: ${hid}.` : "Nothing needed hiding in these messages."} Everything else stays in your browser.
     ${P.examples.length ? `<ul class="ex-hidden">${P.examples.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}</div>`;
  $("run").disabled = !$("ok").checked;
}
$("ok").addEventListener("change", () => { $("run").disabled = !$("ok").checked; });

function show(n) { for (let i = 2; i <= 4; i++) if (i <= n) $(`s${i}`).hidden = false; for (let i = n + 1; i <= 3; i++) $(`s${i}`).hidden = true; }

// ------------------------------------------------------------------ running it
function progress(f, text) { $("prog").hidden = false; $("pfill").style.width = `${Math.round(f * 100)}%`; $("ptext").textContent = text; }
async function askBatch(teams, messages) {
  for (let attempt = 0; attempt < 8; attempt++) {
    let res;
    try { res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teams, messages }) }); }
    catch { await sleep(3000); continue; }
    if (res.status === 429) { await sleep(6000 + attempt * 2000); continue; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return messages.map(() => ({ error: body.error || `The AI service returned ${res.status}` }));
    return body.answers;
  }
  return messages.map(() => ({ error: "The AI service is busy; try again in a few minutes" }));
}
$("run").addEventListener("click", async () => {
  const P = S.plan; if (!P) return;
  S.stop = false; $("run").disabled = true; $("stop").hidden = false;
  document.querySelectorAll("#s1 input, #s1 button, #s2 input, #s2 button, #c-msg, #c-team").forEach((el) => { el.disabled = true; });
  const classes = S.teams.map((t) => t.id);
  progress(0.02, "Training the plain model on your messages, in this browser");
  const docs = P.mode === "labelled" ? P.trainSet : S.teams.map((t) => ({ text: `${t.name}. ${t.name}. ${t.description}`, truth: t.id }));
  const model = load(await train(docs.map((d) => d.text), docs.map((d) => d.truth), classes, { onProgress: (f) => progress(0.02 + f * 0.18, "Training the plain model on your messages, in this browser") }));
  const teams = S.teams.map(({ id, name, description }) => ({ id, name, description }));
  const out = [];
  for (let b = 0; b < P.sample.length && !S.stop; b += BATCH) {
    const chunk = P.sample.slice(b, b + BATCH);
    progress(0.2 + (b / P.sample.length) * 0.8, `Asking the AI: messages ${b + 1} to ${b + chunk.length} of ${P.sample.length}`);
    const answers = await askBatch(teams, chunk.map((it) => it.sent));
    chunk.forEach((it, k) => {
      const ai = answers[k] && !answers[k].error ? answers[k] : null;
      const plain = predict(model, it.text);
      out.push({ ...it, ai, aiError: ai ? null : (answers[k]?.error || "No answer"), plain: plain[0], plain2: plain[1], ...decide(plain[0].team, ai) });
    });
  }
  progress(1, S.stop ? `Stopped after ${out.length} messages` : `Done: ${out.length} messages`);
  $("stop").hidden = true; $("run").disabled = false;
  document.querySelectorAll("#s1 input, #s1 button, #s2 input, #s2 button, #c-msg, #c-team").forEach((el) => { el.disabled = false; });
  S.results = out; renderReport(); show(4); $("s4").hidden = false; $("s4").scrollIntoView({ behavior: "smooth" });
});
$("stop").addEventListener("click", () => { S.stop = true; $("ptext").textContent = "Stopping after this batch"; });

// ------------------------------------------------------------------ 4. the report
const T = (id) => S.teams.find((t) => t.id === id) || { name: id, colour: "#888" };
const chip = (id) => `<span class="tchip" style="--c:${T(id).colour}">${esc(T(id).name)}</span>`;
let filter = "all", shown = 40;
function renderReport() {
  const R = S.results, n = R.length, scored = S.plan.mode === "labelled";
  const sent = R.filter((r) => r.route !== "human"), held = n - sent.length;
  const right = sent.filter((r) => r.route === r.truth).length, wrong = sent.length - right;
  const aiOk = R.filter((r) => r.ai), aiFailed = n - aiOk.length;
  const agree = R.filter((r) => r.ai && r.ai.team === r.plain.team).length;
  $("r-sub").textContent = `${n} messages${S.stop ? " (stopped early)" : ""}, ${scored ? "scored against the team each one really went to" : "with no answers to score against"}.`;
  // the honest comparison: the plain model alone, sending the same number of messages it was most sure of
  const plainTop = [...R].sort((a, b) => b.plain.p - a.plain.p).slice(0, sent.length);
  const plainWrong = plainTop.filter((r) => r.plain.team !== r.truth).length;
  const reasons = new Map();
  for (const r of R) if (r.route === "human") for (const w of r.why) { const k = /only \d+% sure/.test(w) ? `The AI was less than ${Math.round(MIN_CONFIDENCE * 100)}% sure` : w; reasons.set(k, (reasons.get(k) || 0) + 1); }

  let html = `<div class="big4">
    <div class="k fill"><strong>${pct(sent.length / n)}</strong><span>sent straight to a team, with no person involved (${sent.length} of ${n})</span></div>` +
    (scored
      ? `<div class="k"><strong>${pct(right / Math.max(1, sent.length), 1)}</strong><span>of those reached the right team (${wrong} wrong out of ${sent.length})</span></div>
         <div class="k"><strong>${pct(held / n)}</strong><span>held for a person, with the reasons</span></div>
         <div class="k"><strong>${plainWrong}</strong><span>would have gone wrong if the plain model alone had sent its ${sent.length} surest</span></div>`
      : `<div class="k"><strong>${pct(held / n)}</strong><span>held for a person, with the reasons</span></div>
         <div class="k"><strong>${pct(agree / Math.max(1, aiOk.length))}</strong><span>of messages the AI answered, the plain model picked the same team</span></div>
         <div class="k"><strong>${aiFailed}</strong><span>messages the AI couldn't answer (held for a person)</span></div>`) + `</div>`;

  if (scored) {
    const aiAcc = aiOk.filter((r) => r.ai.team === r.truth).length / Math.max(1, aiOk.length), plAcc = R.filter((r) => r.plain.team === r.truth).length / n;
    const verdict = wrong < plainWrong ? `Requiring both to agree let <b>${plainWrong - wrong} fewer</b> mistakes through than the plain model alone would have.`
      : wrong === plainWrong ? `On your messages, the plain model alone was just as safe: it would have let the same ${wrong} through. What the AI adds is a quoted reason a person can check.`
      : `On your messages, the plain model alone was <b>safer</b>: ${plainWrong} wrong against ${wrong}. Worth knowing before paying for the AI.`;
    html += `<div class="callout"><p>${verdict}</p><p>Alone, the AI got ${pct(aiAcc, 1)} right and the plain model ${pct(plAcc, 1)}.
      ${S.plan.trainSet.length < 1000 ? `The plain model learned from ${S.plan.trainSet.length.toLocaleString("en-CA")} of your messages; it gets better with more history.` : ""}
      Messages go straight to a team only when both pick it, the AI is at least ${Math.round(MIN_CONFIDENCE * 100)}% sure, and its quote is really in the message.</p></div>`;
  } else {
    html += `<div class="callout"><p>Without the team each message really went to, this shows what Sorted would do, not whether it's right.</p>
      <p>Add a column with the team (40 or more messages) and run it again for a real score. The plain model is also much stronger once it can learn from your history.</p></div>`;
  }

  // by team, why held, where it gets confused
  const byTeam = S.teams.map((t) => {
    const mine = R.filter((r) => (scored ? r.truth : r.route) === t.id);
    return { t, n: mine.length, ai: mine.filter((r) => r.ai && r.ai.team === t.id).length, pl: mine.filter((r) => r.plain.team === t.id).length, auto: mine.filter((r) => r.route === t.id).length };
  });
  const maxN = Math.max(1, ...byTeam.map((b) => b.n));
  html += `<div class="charts"><div class="chart"><h3>${scored ? "Right, by team" : "Where it sent them"}</h3>
    <p>${scored ? "Bars: how often the AI picked the right team. Thin grey: the plain model." : "Messages sent straight to each team."}</p><div class="bars">` +
    byTeam.map((b) => scored
      ? `<div class="br" style="--c:${b.t.colour}"><span class="lab" title="${esc(b.t.name)}">${esc(b.t.name)}</span><span class="tr"><i style="width:${b.n ? (b.ai / b.n) * 100 : 0}%"></i><i class="b" style="width:${b.n ? (b.pl / b.n) * 100 : 0}%"></i></span><span class="val">${b.n ? pct(b.ai / b.n) : "n/a"} <small>of ${b.n}</small></span></div>`
      : `<div class="br" style="--c:${b.t.colour}"><span class="lab" title="${esc(b.t.name)}">${esc(b.t.name)}</span><span class="tr"><i style="width:${(b.n / maxN) * 100}%"></i></span><span class="val">${b.n}</span></div>`).join("") +
    `</div></div><div class="chart"><h3>Why messages were held</h3><p>A message can be held for more than one reason.</p><ul class="mix">` +
    ([...reasons].sort((a, b) => b[1] - a[1]).map(([w, c]) => `<li><span>${esc(w)}</span><b>${c}</b></li>`).join("") || "<li><span>Nothing was held</span><b>0</b></li>") + `</ul></div></div>`;

  if (scored) {
    const pairs = new Map();
    for (const r of R) if (r.ai && r.ai.team !== r.truth) { const k = `${r.truth}>${r.ai.team}`; if (!pairs.has(k)) pairs.set(k, []); pairs.get(k).push(r); }
    const top = [...pairs].sort((a, b) => b[1].length - a[1].length).slice(0, 5);
    html += `<div class="chart conf"><h3>Where the AI gets confused</h3><p>The right team, then what the AI picked. These are the descriptions worth rewriting: say where the line is between the two.</p>` +
      (top.length ? `<ul class="mix">${top.map(([k, rs]) => { const [a, b] = k.split(">"); return `<li><details><summary><span class="pair">${chip(a)} <span class="arr">to</span> ${chip(b)}</span><b>${rs.length}</b></summary>
        <ul class="eg">${rs.slice(0, 3).map((r) => `<li>${esc(r.sent)}</li>`).join("")}</ul></details></li>`; }).join("")}</ul>` : `<p class="none">The AI picked the right team for every message it answered.</p>`) + `</div>`;
  }

  html += `<div class="table-h"><h3>Every message</h3><div class="seg" role="group" aria-label="Show">
      ${[["all", "All"], ["sent", "Sent"], ["held", "Held"], ...(scored ? [["wrong", "Wrong"]] : [])].map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${filter === k}">${l}</button>`).join("")}</div>
    <button type="button" class="ghost" id="export">Download all as CSV</button></div><ol class="rows" id="rows"></ol><button type="button" class="more" id="more-rows" hidden>Show more</button>`;
  $("report").innerHTML = html;
  $("report").querySelector(".seg").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (!b) return; filter = b.dataset.f; shown = 40; renderReport(); });
  $("export").addEventListener("click", exportCSV);
  $("more-rows").addEventListener("click", () => { shown += 40; renderRows(); });
  renderRows();
}
function renderRows() {
  const R = S.results, scored = S.plan.mode === "labelled";
  const list = R.filter((r) => filter === "all" || (filter === "sent" && r.route !== "human") || (filter === "held" && r.route === "human") || (filter === "wrong" && r.route !== "human" && r.route !== r.truth));
  $("rows").innerHTML = list.slice(0, shown).map((r) => {
    const sentTo = r.route !== "human";
    const status = sentTo ? (scored ? (r.route === r.truth ? `<span class="b right">${CHECK}Right team</span>` : `<span class="b wrong">${CROSS}Wrong team</span>`) : "") : "";
    return `<li><p class="m">${esc(r.sent)}</p><div class="ops2">
        ${scored ? `<span><small>Right team</small>${chip(r.truth)}</span>` : ""}
        <span><small>AI</small>${r.ai ? `${chip(r.ai.team)} <i>${Math.round(r.ai.confidence * 100)}%</i>` : `<em class="err">${esc(r.aiError)}</em>`}</span>
        <span><small>Plain model</small>${chip(r.plain.team)} <i>${Math.round(r.plain.p * 100)}%</i></span></div>
      <div class="dec">${sentTo ? `<span class="b auto">Sent to ${esc(T(r.route).name)}</span>${status}` : `<span class="b person">Held for a person</span><span class="whyl">${r.why.map(esc).join(" · ")}</span>`}</div></li>`;
  }).join("") || `<li class="none">Nothing here.</li>`;
  $("more-rows").hidden = list.length <= shown;
}
function exportCSV() {
  const scored = S.plan.mode === "labelled";
  const rows = [["message_as_sent", ...(scored ? ["right_team"] : []), "ai_team", "ai_confidence", "ai_priority", "ai_quote", "quote_in_message", "ai_reason", "plain_team", "plain_confidence", "decision", "held_because"]];
  for (const r of S.results) rows.push([r.sent, ...(scored ? [T(r.truth).name] : []), r.ai ? T(r.ai.team).name : "", r.ai ? r.ai.confidence : "", r.ai?.priority || "", r.ai?.evidence || "",
    r.ai ? (r.ai.evidenceFound ? "yes" : "no") : "", r.ai?.reason || r.aiError || "", T(r.plain.team).name, r.plain.p.toFixed(3), r.route === "human" ? "held for a person" : `sent to ${T(r.route).name}`, r.why.join("; ")]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([toCSV(rows)], { type: "text/csv" }));
  a.download = "sorted-trial.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

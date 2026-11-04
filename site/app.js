// Inbox Departures: the page. The AI's answer comes from the Worker; the plain model runs here
// (baseline.js) and the decision is made here (rule.js), the same code the scoring run used.
import { load, predict } from "./baseline.js";
import { decide } from "./rule.js";

const API = window.TRIAGE_API;
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

const NAME = { cards: "Cards", transfers: "Transfers", top_ups: "Top-ups", cash: "Cash and ATMs", fees_fx: "Fees and exchange",
  account: "Account and identity", fraud: "Fraud and security", human: "Human desk" };
const GATE = { cards: "CARDS", transfers: "TRANSFERS", top_ups: "TOP-UPS", cash: "CASH/ATM", fees_fx: "FEES/FX", account: "ACCOUNT",
  fraud: "FRAUD", human: "HUMAN DESK" };
const intentName = (s) => s.replace(/\?$/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// ---------------------------------------------------------------- split-flap letters
const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-%.";
export function flap(el, text, { cls = "", pad = 0 } = {}) {
  const target = String(text).toUpperCase().padEnd(pad, " ");
  el.className = `flaps ${cls}`.trim();
  el.setAttribute("aria-label", String(text));
  el.innerHTML = [...target].map((c) => `<span class="f${c === " " ? " sp" : ""}" aria-hidden="true">${esc(c === " " ? " " : c)}</span>`).join("");
  if (still) return;
  const cells = [...el.children];
  cells.forEach((cell, i) => {
    const want = target[i];
    if (want === " ") return;
    let n = 4 + i * 2 + Math.floor(Math.random() * 3);
    const t = setInterval(() => {
      if (--n <= 0) { cell.textContent = want; clearInterval(t); return; }
      cell.textContent = CHARS[1 + Math.floor(Math.random() * (CHARS.length - 1))];
    }, 45);
  });
}

// ---------------------------------------------------------------- clock
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const tick = () => { $("#clock").textContent = hhmm(new Date()); };
tick(); setInterval(tick, 15000);

// ---------------------------------------------------------------- data
const get = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(p); return r.json(); });
let model = null;
const modelReady = get("data/baseline.json").then((m) => (model = load(m)));
const resultsReady = get("data/results.json");
const inboxReady = get("data/inbox.json");

// ---------------------------------------------------------------- hero numbers
function stat(value, label, cls = "") {
  const d = document.createElement("div");
  d.className = "stat";
  d.innerHTML = `<span></span><p>${esc(label)}</p>`;
  flap(d.firstChild, value, { cls });
  return d;
}
resultsReady.then((r) => {
  const box = $("#hero-stats");
  if (r.ai) {
    box.append(stat(`${r.decision.autoRate}%`, "sent straight to a team"),
      stat(`${r.decision.autoCorrect}%`, "of those were the right team", "green"),
      stat(`${r.ai.correct}%`, "the AI alone", "text"),
      stat(`${r.baseline.correct}%`, "the plain model alone", "text"));
  } else {
    box.append(stat(`${r.baseline.correct}%`, "the plain model alone"), stat("770", "test messages scored", "text"),
      stat("7", "teams", "text"), stat("SOON", "AI scoring run", "blue"));
  }
}).catch(() => {});

// ---------------------------------------------------------------- check in a message
const EXAMPLE_INTENTS = ["compromised_card", "transfer_not_received_by_recipient", "card_swallowed", "exchange_rate", "verify_my_identity", "top_up_failed"];
const TYPED = ["it still isn't working and nobody is helping me", "Why was I charged twice for one coffee?"];
inboxReady.then((rows) => {
  const box = $("#examples");
  const real = EXAMPLE_INTENTS.map((i) => rows.find((r) => r.intent === i)).filter(Boolean);
  const chip = (text, cls = "") => {
    const b = document.createElement("button");
    b.type = "button"; b.className = `chip ${cls}`.trim(); b.textContent = text; b.title = text;
    return b;
  };
  const rand = chip("Random real message", "rand");
  rand.addEventListener("click", () => { $("#msg").value = rows[Math.floor(Math.random() * rows.length)].text; route(); });
  box.append(rand);
  for (const t of [...real.map((r) => r.text), ...TYPED]) {
    const b = chip(t);
    b.addEventListener("click", () => { $("#msg").value = t; route(); });
    box.append(b);
  }
}).catch(() => {});

function highlight(message, evidence, found) {
  if (!found || !evidence) return esc(message);
  const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'");
  const i = norm(message).indexOf(norm(evidence).replace(/\s+/g, " ").trim());
  if (i < 0) return esc(message);
  const e = evidence.replace(/\s+/g, " ").trim();
  return esc(message.slice(0, i)) + `<mark>${esc(message.slice(i, i + e.length))}</mark>` + esc(message.slice(i + e.length));
}

async function askAI(message) {
  if (!API) throw new Error("No AI server is set up for this copy of the page.");
  const res = await fetch(`${API}/triage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The AI server returned ${res.status}.`);
  return data;
}

let busy = false;
async function route() {
  const message = $("#msg").value.replace(/\s+/g, " ").trim();
  const pass = $("#pass");
  if (message.length < 3) { $("#msg").focus(); return; }
  if (busy) return;
  busy = true; $("#go").disabled = true;
  pass.hidden = false;
  pass.innerHTML = `<div class="loading">Reading the message</div>`;
  pass.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "nearest" });
  await modelReady.catch(() => {});
  const plain = model ? predict(model, message) : null;
  let ai = null, aiError = "";
  try { ai = await askAI(message); } catch (e) { aiError = e.message; }
  busy = false; $("#go").disabled = false;
  if (!plain) { pass.innerHTML = `<p class="loading err">The plain model didn't load. Refresh the page and try again.</p>`; return; }
  const d = decide(plain[0].team, ai);
  const pct = (p) => `${Math.round(p * 100)}%`;
  pass.innerHTML = `
    <div class="pass-msg">${highlight(message, ai?.evidence, ai?.evidenceFound)}</div>
    <div class="pass-fields">
      <div class="field gate"><small>Gate</small><span id="f-gate"></span></div>
      <div class="field"><small>Priority</small><span id="f-pri"></span></div>
      <div class="field"><small>Status</small><span id="f-st"></span></div>
    </div>
    <div class="opinions">
      <div class="op"><h3>The AI (Gemini)</h3>${ai ? `
        <div class="team">${esc(NAME[ai.team])}</div>
        <div class="meter"><i style="width:${Math.round(ai.confidence * 100)}%"></i></div><span>${pct(ai.confidence)} sure</span>
        <p>${esc(ai.reason)}</p>
        <p class="check ${ai.evidenceFound ? "yes" : "no"}">${ai.evidenceFound ? "✓ Its quote is in the message (highlighted)" : "✗ Its quote isn't in the message"}</p>` :
        `<p class="err">${esc(aiError)}</p>`}</div>
      <div class="op"><h3>The plain model</h3>
        <div class="team">${esc(NAME[plain[0].team])}</div>
        <div class="meter"><i style="width:${Math.round(plain[0].p * 100)}%"></i></div><span>${pct(plain[0].p)} probability</span>
        <p>Runner-up: ${esc(NAME[plain[1].team])} (${pct(plain[1].p)})</p></div>
    </div>
    <div class="verdict ${d.route === "human" ? "human" : "auto"}">${d.route === "human"
      ? `<b>Held for the human desk.</b><ul>${d.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
      : `<b>Sent straight to ${esc(NAME[d.route])}.</b> Both opinions agree, the AI is sure, and its quote checks out.`}</div>
    ${ai?.cached ? `<p class="pass-note">This exact message was asked recently, so the AI's saved answer was reused.</p>` : ""}`;
  flap($("#f-gate"), GATE[d.route], { cls: d.route === "human" ? "blue" : "" });
  const pri = ai?.priority || "normal";
  flap($("#f-pri"), ai ? pri : "-", { cls: pri === "urgent" ? "red" : pri === "high" ? "" : "text" });
  flap($("#f-st"), d.route === "human" ? "CHECK" : "BOARDING", { cls: d.route === "human" ? "blue" : "green" });
}
$("#form").addEventListener("submit", (e) => { e.preventDefault(); route(); });
$("#msg").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); route(); } });

// ---------------------------------------------------------------- run the inbox
const MAX_ROWS = 10;
let queue = [], timer = 0, clockAt = new Date(), tally = { n: 0, ok: 0, bad: 0, hum: 0 };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const status = (r) => r.route === "human" ? ["hum", "HUMAN DESK"] : r.route === r.team ? ["ok", "ON TIME"] : ["bad", "WRONG GATE"];

function drawScore() {
  const t = tally;
  $("#score").innerHTML = `<span>Departed <b>${t.n}</b></span><span class="ok">On time <b>${t.ok}</b></span><span class="bad">Wrong gate <b>${t.bad}</b></span><span class="hum">Human desk <b>${t.hum}</b></span>`;
}
function addRow() {
  const r = queue.shift();
  if (!r) { stop(); $("#run").disabled = true; return; }
  const [cls, label] = status(r);
  tally.n++; tally[cls]++;
  clockAt = new Date(clockAt.getTime() + 60000);
  const li = document.createElement("li");
  li.className = "row enter";
  li.innerHTML = `<button type="button" aria-expanded="false">
      <span class="r-time">${hhmm(clockAt)}</span><span class="r-msg">${esc(r.text)}</span>
      <span class="r-gate"><span></span></span><span class="r-pri pri ${r.ai.priority}">${r.ai.priority}</span>
      <span class="r-st"><b class="st ${cls}">${label}</b></span></button>`;
  flap(li.querySelector(".r-gate span"), GATE[r.route], { cls: r.route === "human" ? "blue" : cls === "bad" ? "red" : "" });
  li.firstChild.addEventListener("click", () => toggle(li, r));
  const rows = $("#rows");
  rows.prepend(li);
  while (rows.children.length > MAX_ROWS) rows.lastChild.remove();
  drawScore();
}
function toggle(li, r) {
  const btn = li.firstChild, open = btn.getAttribute("aria-expanded") === "true";
  btn.setAttribute("aria-expanded", String(!open));
  li.querySelector(".row-detail")?.remove();
  if (open) return;
  const d = document.createElement("div");
  d.className = "row-detail";
  d.innerHTML = `<div><small>The AI</small>${esc(NAME[r.ai.team])}, ${Math.round(r.ai.confidence * 100)}% sure${r.ai.evidenceFound ? `, quoting "${esc(r.ai.evidence)}"` : ", quote not found"}</div>
    <div><small>The plain model</small>${esc(NAME[r.baseline.team])}, ${Math.round(r.baseline.p * 100)}%</div>
    <div><small>Right answer</small>${esc(NAME[r.team])} (Banking77: ${esc(intentName(r.intent))})${r.why.length ? `<br><small style="margin-top:6px">Held because</small>${r.why.map(esc).join(". ")}` : ""}</div>`;
  li.append(d);
}
function start() { if (timer) return; addRow(); timer = setInterval(addRow, still ? 900 : 1700); $("#run").textContent = "Pause"; }
function stop() { clearInterval(timer); timer = 0; $("#run").textContent = "Start"; }
function reset(rows) {
  stop(); queue = shuffle(rows.filter((r) => r.ai)); tally = { n: 0, ok: 0, bad: 0, hum: 0 }; clockAt = new Date();
  $("#rows").innerHTML = ""; $("#run").disabled = !queue.length; drawScore();
}
inboxReady.then((rows) => {
  const scored = rows.filter((r) => r.ai);
  if (!scored.length) {
    $("#board-empty").hidden = false;
    $("#board-empty").textContent = "The AI scoring run hasn't finished yet. Once it has, every message here is replayed with its saved answers.";
    $("#run").disabled = $("#more").disabled = true;
    drawScore();
    return;
  }
  reset(rows);
  $("#run").addEventListener("click", () => (timer ? stop() : start()));
  $("#more").addEventListener("click", () => { reset(rows); start(); });
  // start by itself the first time the board comes into view
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { start(); io.disconnect(); } }, { threshold: 0.35 });
    io.observe($(".board"));
  }
}).catch(() => { $("#board-empty").hidden = false; $("#board-empty").textContent = "The saved messages didn't load. Refresh to try again."; });

// ---------------------------------------------------------------- results
const bar = (label, value, n, extra = "") => `<div class="bar"><span class="lab">${label}</span><span class="tr"><i style="width:${value ?? 0}%"></i>${extra}</span><span class="val">${value ?? "-"}%${n != null ? ` <span class="n">(${n})</span>` : ""}</span></div>`;
resultsReady.then((r) => {
  const body = $("#results-body");
  if (!r.ai) {
    body.innerHTML = `<div class="pending">The plain model is scored: <b>${r.baseline.correct}%</b> of the 770 messages to the right team
      (${(r.baseline.testAccuracyAll * 100).toFixed(1)}% across all 3,080 test messages). The AI's scoring run is next; its results,
      and how the two do together, appear here when it finishes.</div>`;
    return;
  }
  const d = r.decision, c = r.confidenceOnly;
  body.innerHTML = `
    <div class="big">
      <div class="stat"><span></span><p>of messages sent straight to a team</p></div>
      <div class="stat"><span></span><p>of those reached the right team</p></div>
      <div class="stat"><span></span><p>held for a person instead</p></div>
      <div class="stat"><span></span><p>the AI's quote really was in the message</p></div>
    </div>
    <div class="callout">
      <p><b>Agreement catches what confidence misses.</b> Trusting the AI whenever it said it was at least 80% sure would have sent
        ${c.autoWrong} messages to the wrong team. Also requiring the plain model to agree let ${d.autoWrong} through, while still routing ${d.autoRate}% automatically.</p>
      <p>Alone, the AI put ${r.ai.correct}% of messages in the right team and the plain model ${r.baseline.correct}%. The plain model has seen
        10,000 messages like these; the AI has seen none, which is why it helps most on messages that don't look like the training set.</p>
    </div>
    <div class="charts">
      <div class="chart"><h3>Can its "how sure" be trusted?</h3><p>How often the AI was right, grouped by how sure it said it was.</p>
        <div class="bars">${r.calibration.filter((b) => b.n).map((b) => bar(`${Math.round(b.from * 100)}-${Math.round(b.to * 100)}%`, b.correct, b.n)).join("")}</div></div>
      <div class="chart"><h3>Right team, by team</h3><p>The AI (amber) and the plain model (grey).</p>
        <div class="bars">${r.perTeam.map((t) => bar(esc(NAME[t.team]).replace(" and ", " & "), t.ai, null, `<i class="b" style="width:${t.baseline}%"></i>`)).join("")}</div>
        <div class="keys"><span><i style="background:var(--amber)"></i>The AI</span><span><i style="background:#5B6372"></i>Plain model</span></div></div>
      <div class="chart"><h3>Where the AI went wrong</h3><p>Its most common wrong gates, out of ${r.scored} messages.</p>
        <ul class="mix">${r.confusions.map((m) => `<li><span>${esc(NAME[m.from])} → ${esc(NAME[m.to])}</span><b>${m.n}</b></li>`).join("") || "<li>None</li>"}</ul></div>
      <div class="chart"><h3>Priority</h3><p>Did the AI flag the urgent ones?</p>
        <div class="bars">${bar("Urgent caught", r.ai.urgentCaught, null)}${bar("Exact match", r.ai.priorityExact, null)}</div></div>
    </div>`;
  const s = body.querySelectorAll(".big .stat > span");
  flap(s[0], `${d.autoRate}%`); flap(s[1], `${d.autoCorrect}%`, { cls: "green" }); flap(s[2], `${d.humanRate}%`, { cls: "blue" }); flap(s[3], `${r.ai.evidenceFound}%`, { cls: "text" });
  $("#results-sub").textContent = `${r.scored} test messages, 10 from each of Banking77's 77 request types. Model ${r.model}, prompt ${r.prompt}.`;
}).catch(() => { $("#results-body").innerHTML = `<p class="err">The results didn't load. Refresh to try again.</p>`; });

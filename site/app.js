// Sorted: the page. The AI's answer comes from the Worker; the plain model runs here (baseline.js)
// and the decision is made here (rule.js), the same code the scoring run used.
import { load, predict } from "./baseline.js";
import { decide } from "./rule.js";

const API = window.TRIAGE_API;
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const wide = matchMedia("(min-width: 1000px)");

const TEAMS = ["fraud", "cards", "transfers", "top_ups", "cash", "fees_fx", "account"];
const NAME = { cards: "Cards", transfers: "Transfers", top_ups: "Top-ups", cash: "Cash and ATMs", fees_fx: "Fees and exchange",
  account: "Account and identity", fraud: "Fraud and security", human: "A person checks" };
const colour = (t) => `var(--${t || "human"})`;
const pct = (p) => `${Math.round(p * 100)}%`;
const intentName = (s) => s.replace(/\?$/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// ---------------------------------------------------------------- data
const get = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(p); return r.json(); });
let model = null;
const modelReady = get("data/baseline.json").then((m) => (model = load(m)));
const resultsReady = get("data/results.json");
const inboxReady = get("data/inbox.json");

// ---------------------------------------------------------------- state
let saved = [];                 // the scored test messages
const mine = [];                // messages sorted on this visit, newest first
const S = { queue: "all", show: "all", limit: 30, selected: null };
const all = () => [...mine, ...saved];
const inQueue = (r) => S.queue === "all" || r.route === S.queue;
const isWrong = (r) => !r.mine && r.route !== "human" && r.route !== r.team;
const visible = () => all().filter((r) => inQueue(r) && (S.show === "all" || isWrong(r)));

// ---------------------------------------------------------------- queues
function drawQueues() {
  const n = (q) => all().filter((r) => q === "all" || r.route === q).length;
  const btn = (q, label, c) => `<button type="button" class="q${q === "all" ? " all" : ""}" data-q="${q}" aria-pressed="${S.queue === q}" style="--c:${c}">
    <span class="nm">${q === "all" ? "" : `<span class="sw" style="background:${c}"></span>`}${esc(label)}</span><i>${n(q)}</i></button>`;
  $("#queues").innerHTML = `<h3>Queues</h3>${btn("all", "Everything", "var(--ink)")}${TEAMS.map((t) => btn(t, NAME[t], colour(t))).join("")}${btn("human", NAME.human, colour("human"))}`;
}
$("#queues").addEventListener("click", (e) => {
  const b = e.target.closest(".q");
  if (!b) return;
  S.queue = b.dataset.q; S.limit = 30; S.selected = null;
  drawQueues(); drawList();
});
document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
  S.show = b.dataset.show; S.limit = 30; S.selected = null;
  document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  drawList();
}));

// ---------------------------------------------------------------- the inbox list
function item(r) {
  const st = r.pending ? `<span class="b normal">Sorting</span>` :
    `<span class="b ${r.ai?.priority || "normal"}">${esc(r.ai?.priority ? r.ai.priority[0].toUpperCase() + r.ai.priority.slice(1) : "Normal")}</span>` +
    (r.route === "human" ? `<span class="b person">A person checks</span>` : `<span class="b auto">Sorted automatically</span>`) +
    (r.mine ? "" : r.route === "human" ? "" : r.route === r.team ? `<span class="b right">✓ Right team</span>` : `<span class="b wrong">✗ Wrong team</span>`);
  return `<li class="it${r.mine ? " new" : ""}${S.selected === r.id ? " on" : ""}" data-id="${esc(r.id)}" style="--c:${colour(r.pending ? "human" : r.route)}">
    <button type="button" aria-expanded="${S.selected === r.id}"><div class="a"><span class="tm">${r.pending ? "…" : esc(NAME[r.route])}</span><span>${r.mine ? "just now" : "#" + r.id}</span></div>
    <p>${esc(r.text)}</p>${st}</button></li>`;
}
function drawList() {
  const rows = visible();
  $("#list-title").textContent = S.queue === "all" ? "Everything" : NAME[S.queue];
  const items = $("#items");
  items.innerHTML = rows.slice(0, S.limit).map(item).join("") ||
    `<li class="empty">${saved.length ? (S.show === "wrong" ? "No mistakes in this queue." : "Nothing here yet.") : "The AI scoring run hasn't finished yet. Sort your own message above in the meantime."}</li>`;
  $("#more").hidden = rows.length <= S.limit;
  $("#more").textContent = `Show more (${rows.length - S.limit} left)`;
  if (!S.selected && wide.matches && rows[0]) S.selected = rows[0].id, items.firstElementChild?.classList.add("on");
  drawDetail();
}
$("#more").addEventListener("click", () => { S.limit += 30; drawList(); });
$("#items").addEventListener("click", (e) => {
  const li = e.target.closest(".it");
  if (!li || e.target.closest(".det")) return;
  const id = li.dataset.id;
  S.selected = !wide.matches && S.selected === id ? null : id;     // on phones, tap again to close
  $("#items").querySelectorAll(".it").forEach((x) => { x.classList.toggle("on", x.dataset.id === S.selected); x.firstElementChild.setAttribute("aria-expanded", String(x.dataset.id === S.selected)); });
  drawDetail();
});
wide.addEventListener("change", () => drawList());

// ---------------------------------------------------------------- one message in detail
function highlight(message, evidence, found) {
  if (!found || !evidence) return esc(message);
  const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'");
  const e = evidence.replace(/\s+/g, " ").trim(), i = norm(message).indexOf(norm(e));
  if (i < 0) return esc(message);
  return esc(message.slice(0, i)) + `<mark>${esc(message.slice(i, i + e.length))}</mark>` + esc(message.slice(i + e.length));
}
function detailHTML(r) {
  if (r.pending) return `<div class="meta">just now</div><div class="msg">${esc(r.text)}</div><p class="loading">Both models are reading it</p>`;
  const ai = r.ai, held = r.route === "human";
  const checks = [
    [ai && ai.team === r.baseline.team, "Both agree", "They disagree"],
    [ai && ai.confidence >= 0.8, "AI is sure", ai ? `AI only ${pct(ai.confidence)} sure` : "No AI answer"],
    [ai && ai.evidenceFound, "Quote found", "Quote not in message"],
  ];
  return `<div class="meta">${r.mine ? "Your message · just now" : `#${esc(r.id)} · Banking77 test set`}</div>
    <div class="msg">${highlight(r.text, ai?.evidence, ai?.evidenceFound)}</div>
    <div class="tiles">
      <div class="t big${held ? " human" : ""}"><small>${held ? "Held for" : "Sorted to"}</small><strong>${held ? "A person" : esc(NAME[r.route])}</strong></div>
      <div class="t"><small>Priority</small><strong style="color:${ai?.priority === "urgent" ? "var(--bad)" : "inherit"}">${ai ? esc(ai.priority[0].toUpperCase() + ai.priority.slice(1)) : "-"}</strong></div>
      <div class="t"><small>AI is</small><strong>${ai ? pct(ai.confidence) + " sure" : "-"}</strong></div>
    </div>
    <div class="ops">
      <div class="op" style="--oc:${colour(ai?.team)}"><small>The AI · Gemini</small>${ai ? `<div class="v">${esc(NAME[ai.team])}</div>
        <div class="bar"><i style="width:${pct(ai.confidence)}"></i></div><div class="n">${pct(ai.confidence)} sure${ai.reason ? ` · "${esc(ai.reason)}"` : ""}</div>` : `<p class="err">${esc(r.aiError || "No answer")}</p>`}</div>
      <div class="op" style="--oc:${colour(r.baseline.team)}"><small>The plain model</small><div class="v">${esc(NAME[r.baseline.team])}</div>
        <div class="bar"><i style="width:${pct(r.baseline.p)}"></i></div><div class="n">${pct(r.baseline.p)}${r.runnerUp ? ` · runner-up ${esc(NAME[r.runnerUp.team])}, ${pct(r.runnerUp.p)}` : ""}</div></div>
    </div>
    <div class="why${held ? " held" : ""}">${checks.map(([ok, y, n]) => `<span class="c ${ok ? "y" : "n"}">${ok ? "✓ " + y : "✗ " + n}</span>`).join("")}
      <em>${held ? "So a person decides where it goes." : "So it went straight to the team."}</em></div>
    ${r.mine ? `<p class="truth">There's no right answer on file for your own messages.${r.cached ? " This exact message was asked recently, so the AI's saved answer was reused." : ""}</p>`
      : `<p class="truth">Right answer: <b>${esc(NAME[r.team])}</b> (Banking77 label: ${esc(intentName(r.intent))}). ${r.route === "human" ? "" : r.route === r.team ? "Sorted correctly." : "Sorted to the wrong team."}</p>`}`;
}
function drawDetail() {
  document.querySelectorAll(".it .det").forEach((d) => d.remove());
  const r = all().find((x) => x.id === S.selected);
  const pane = $("#detail");
  if (wide.matches) {
    pane.hidden = false;
    pane.style.setProperty("--c", colour(r?.route));
    pane.innerHTML = r ? detailHTML(r) : `<div class="hint"><h3>Pick a message</h3><p>Or type your own at the top. You'll see both opinions, the checks, and where it went.</p></div>`;
  } else {
    pane.hidden = true;
    const li = r && $(`#items .it[data-id="${CSS.escape(r.id)}"]`);
    if (li) { const d = document.createElement("div"); d.className = "det"; d.style.setProperty("--c", colour(r.route)); d.innerHTML = detailHTML(r); li.append(d); }
  }
}

// ---------------------------------------------------------------- sort your own message
async function askAI(message) {
  if (!API) throw new Error("No AI server is set up for this copy of the page.");
  const res = await fetch(`${API}/triage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `The AI server returned ${res.status}.`);
  return data;
}
let n = 0, busy = false;
async function sortIt(text) {
  const message = String(text).replace(/\s+/g, " ").trim();
  if (message.length < 3) { $("#msg").focus(); return; }
  if (busy) return;
  busy = true; $("#go").disabled = true;
  const r = { id: `you-${++n}`, text: message, mine: true, pending: true, route: "human", baseline: { team: "cards", p: 0 } };
  mine.unshift(r);
  S.queue = "all"; S.show = "all"; S.selected = r.id;
  document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.show === "all")));
  drawQueues(); drawList();
  $("#inbox").scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  await modelReady.catch(() => {});
  try { r.ai = await askAI(message); r.cached = r.ai.cached; } catch (e) { r.ai = null; r.aiError = e.message; }
  const plain = model ? predict(model, message) : [{ team: "cards", p: 0 }, { team: "cards", p: 0 }];
  r.baseline = { team: plain[0].team, p: plain[0].p }; r.runnerUp = plain[1];
  const d = decide(r.baseline.team, r.ai);
  r.route = d.route; r.why = d.why; r.pending = false;
  busy = false; $("#go").disabled = false;
  drawQueues(); drawList();
}
$("#form").addEventListener("submit", (e) => { e.preventDefault(); sortIt($("#msg").value); });

// example messages: real ones from the test set, plus two written to be awkward
const EXAMPLE_INTENTS = ["transfer_not_received_by_recipient", "card_swallowed", "compromised_card", "exchange_rate", "verify_my_identity"];
const TYPED = ["it still isn't working and nobody is helping me", "Why was I charged twice for one coffee?"];
function examples(rows) {
  const box = $("#examples");
  const chip = (label, text, cls = "") => {
    const b = document.createElement("button");
    b.type = "button"; b.className = cls; b.textContent = label; b.title = text || label;
    b.addEventListener("click", () => { const t = text || rows[Math.floor(Math.random() * rows.length)].text; $("#msg").value = t; sortIt(t); });
    return b;
  };
  box.append(chip("Random real message", "", "rand"));
  for (const t of [...EXAMPLE_INTENTS.map((i) => rows.find((r) => r.intent === i)?.text).filter(Boolean), ...TYPED]) box.append(chip(t, t));
}

inboxReady.then((rows) => {
  // a fixed shuffle, so every team turns up near the top rather than the dataset's order
  let seed = 77;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  saved = rows.filter((r) => r.ai).map((r) => ({ ...r, id: String(r.id), k: rand() })).sort((a, b) => a.k - b.k);
  examples(rows);
  drawQueues(); drawList();
}).catch(() => { drawQueues(); drawList(); });

// ---------------------------------------------------------------- results
const bar = (label, value, c, extra = "", count) => `<div class="br" style="--c:${c}"><span class="lab">${label}</span><span class="tr"><i style="width:${value ?? 0}%"></i>${extra}</span><span class="val">${value ?? "-"}%${count != null ? ` <small>(${count})</small>` : ""}</span></div>`;
resultsReady.then((r) => {
  $("#tag").textContent = r.scored ? `Banking77 · ${r.scored} scored` : "Banking77";
  const body = $("#results-body");
  if (!r.ai) {
    body.innerHTML = `<div class="pending">The plain model is scored: <b>${r.baseline.correct}%</b> of the 770 messages to the right team
      (${(r.baseline.testAccuracyAll * 100).toFixed(1)}% across all 3,080 test messages). The AI's scoring run is next; its results,
      and how the two do together, appear here when it finishes.</div>`;
    return;
  }
  const d = r.decision, c = r.confidenceOnly;
  $("#results-sub").textContent = `${r.scored} test messages, 10 from each of Banking77's 77 request types. Model ${r.model}, prompt ${r.prompt}.`;
  body.innerHTML = `
    <div class="big4">
      <div class="k fill"><strong>${d.autoRate}%</strong><span>sorted automatically</span></div>
      <div class="k"><strong style="color:var(--ok)">${d.autoCorrect}%</strong><span>of those reached the right team</span></div>
      <div class="k"><strong>${d.humanRate}%</strong><span>held for a person instead</span></div>
      <div class="k"><strong>${r.ai.evidenceFound}%</strong><span>of the AI's quotes really were in the message</span></div>
    </div>
    <div class="callout">
      <p><b>Agreement catches what confidence misses.</b> Trusting the AI whenever it said it was at least 80% sure would have sent
        ${c.autoWrong} messages to the wrong team. Also requiring the plain model to agree let ${d.autoWrong} through, while still sorting ${d.autoRate}% automatically.</p>
      <p>Alone, the AI put ${r.ai.correct}% of messages in the right team and the plain model ${r.baseline.correct}%. The plain model has seen
        10,000 messages like these; the AI has seen none.</p>
      ${r.plainOnly ? `<p><b>The honest catch:</b> the plain model on its own, sending only its ${r.plainOnly.autoRate}% most confident messages,
        let ${r.plainOnly.autoWrong} through. On this data the AI doesn't make routing safer than a well-trained model. What it adds is a
        quoted reason a person can check, and it needs no training data, which matters for a new inbox with no labelled history.</p>` : ""}
    </div>
    <div class="charts">
      <div class="chart"><h3>Can its "how sure" be trusted?</h3><p>How often the AI was right, grouped by how sure it said it was.</p>
        <div class="bars">${r.calibration.filter((b) => b.n).map((b) => bar(`${Math.round(b.from * 100)} to ${Math.round(b.to * 100)}% sure`, b.correct, "var(--ink)", "", b.n)).join("")}</div></div>
      <div class="chart"><h3>Right team, by team</h3><p>The AI (thick bar) and the plain model (thin grey bar).</p>
        <div class="bars">${r.perTeam.map((t) => bar(esc(NAME[t.team]), t.ai, colour(t.team), `<i class="b" style="width:${t.baseline}%"></i>`)).join("")}</div>
        <div class="keys"><span><i style="background:var(--ink)"></i>The AI</span><span><i style="background:#A9A9B0"></i>Plain model</span></div></div>
      <div class="chart"><h3>Where the AI went wrong</h3><p>Its most common wrong teams, out of ${r.scored} messages.</p>
        <ul class="mix">${r.confusions.map((m) => `<li><span class="pair"><span class="dot" style="background:${colour(m.from)}"></span>${esc(NAME[m.from])} → <span class="dot" style="background:${colour(m.to)}"></span>${esc(NAME[m.to])}</span><b>${m.n}</b></li>`).join("") || "<li>None</li>"}</ul></div>
      <div class="chart"><h3>Priority</h3><p>Did the AI flag the urgent ones?</p>
        <div class="bars">${bar("Urgent caught", r.ai.urgentCaught, "var(--fraud)")}${bar("Exact match", r.ai.priorityExact, "var(--ink)")}</div></div>
    </div>`;
}).catch(() => { $("#results-body").innerHTML = `<p class="pending">The results didn't load. Refresh to try again.</p>`; });

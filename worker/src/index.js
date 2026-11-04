/* Ticket triage Worker: holds the Gemini key and answers one message at a time for the demo page.
   Everything else (the second opinion, the decision, the scoring) happens in the browser. */
import { askGemini, MODEL, PROMPT_VERSION, MAX_CHARS } from "./triage.js";

const ALLOWED_ORIGINS = ["https://lekanlawal1.github.io", "http://localhost:8800", "http://127.0.0.1:8800"];

function cors(origin) {
  return { "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" };
}
const json = (body, status, origin) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });

async function sha(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
    if (url.pathname === "/health") return json({ ok: true, model: MODEL, prompt: PROMPT_VERSION }, 200, origin);
    if (request.method !== "POST" || url.pathname !== "/triage") return json({ error: "not found" }, 404, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "This service only answers the ticket triage page." }, 403, origin);

    let body;
    try { body = await request.json(); } catch { return json({ error: "Send JSON." }, 400, origin); }
    const message = String(body.message || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
    if (message.length < 3) return json({ error: "Type a message first." }, 400, origin);

    // the same message gets the same answer for a day, and doesn't count against the limit
    const key = new Request(`https://cache.ticket-triage/${PROMPT_VERSION}/${MODEL}/${await sha(message)}`);
    const hit = await caches.default.match(key);
    if (hit) return json({ ...(await hit.json()), cached: true }, 200, origin);

    const { success } = await env.RATE_LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") || "unknown" });
    if (!success) return json({ error: "That's a lot of messages in a minute. Wait a moment and try again." }, 429, origin);

    try {
      const answer = { ...(await askGemini(env.GEMINI_API_KEY, message)), model: MODEL, prompt: PROMPT_VERSION };
      ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(answer), { headers: { "Cache-Control": "max-age=86400" } })));
      return json(answer, 200, origin);
    } catch (err) {
      return json({ error: err.message || "Something went wrong." }, 502, origin);
    }
  },
};

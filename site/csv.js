// Read a CSV (or a semicolon, tab or bar separated export) the way spreadsheets write it: quoted
// fields can hold separators, quotes ("") and line breaks. Pasted text with no separators is read
// as one message per line.
export function sniff(text) {
  const first = String(text).split(/\r?\n/).find((l) => l.trim()) || "";
  let best = null, most = 0;
  for (const d of [",", ";", "\t", "|"]) {
    let n = 0, q = false;
    for (const ch of first) { if (ch === '"') q = !q; else if (ch === d && !q) n++; }
    if (n > most) { most = n; best = d; }
  }
  return best;
}

const lines = (src) => src.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => [l]);

// Pasted messages often contain commas. Read the text as a spreadsheet only when the first row
// looks like a header (short labels) and most rows have the same number of columns.
export function looksTabular(rows) {
  if (rows.length < 2 || rows[0].length < 2) return false;
  const width = rows[0].length;
  const headerOk = rows[0].every((h) => h.trim().length <= 40 && h.trim().split(/\s+/).length <= 5);
  const same = rows.slice(1).filter((r) => r.length === width).length / (rows.length - 1);
  return headerOk && same >= 0.8;
}

export function parse(text, sep = sniff(text)) {
  const src = String(text).replace(/^﻿/, "");
  if (!sep) return lines(src);
  const rows = parseWith(src, sep);
  return looksTabular(rows) ? rows : lines(src);
}

function parseWith(src, sep) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"' && field === "") q = true;
    else if (ch === sep) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

// which column holds the message, and which (if any) the team it went to
const MESSAGE = /message|text|body|description|content|ticket|subject|comment|issue|query|request|email/i;
const TEAM = /team|queue|group|department|dept|category|assignee|label|class|intent|topic|route/i;
export function guessColumns(header, rows) {
  const avgLen = (c) => rows.slice(0, 50).reduce((s, r) => s + String(r[c] || "").length, 0) / Math.max(1, Math.min(50, rows.length));
  const cols = header.map((h, i) => i);
  let message = cols.find((c) => MESSAGE.test(header[c]));
  if (message === undefined) message = cols.reduce((a, c) => (avgLen(c) > avgLen(a) ? c : a), 0);
  const team = cols.find((c) => c !== message && TEAM.test(header[c]));
  return { message, team: team === undefined ? -1 : team };
}

export function toCSV(rows) {
  return rows.map((r) => r.map((v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\r\n");
}

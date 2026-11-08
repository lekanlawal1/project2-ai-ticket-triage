// Before any message leaves the browser, the things most likely to identify a person are hidden:
// email addresses, links, Canadian postcodes and long numbers (phone, card, account and order
// numbers). Dates and money amounts stay, since they rarely identify anyone and often matter.
const RULES = [
  ["email", /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, "[email]"],
  ["link", /\b(?:https?:\/\/|www\.)\S+/gi, "[link]"],
  ["postcode", /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/gi, "[postcode]"],
];
const NUMBER = /\+?\(?\d[\d\s().-]*\d/g;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function redact(text) {
  const counts = { email: 0, link: 0, postcode: 0, number: 0 };
  let s = String(text);
  for (const [kind, re, mask] of RULES) s = s.replace(re, () => { counts[kind]++; return mask; });
  // a run of digits (with spaces, dashes, dots or brackets between them) holding 7 or more digits
  s = s.replace(NUMBER, (m) => {
    const digits = m.replace(/\D/g, "").length;
    if (digits < 7 || DATE.test(m.trim())) return m;
    counts.number++;
    return "[number]";
  });
  return { text: s, counts };
}

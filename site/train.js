// Train the plain model in the browser, on a visitor's own labelled messages. It is the same model
// as pipeline/baseline.py (TF-IDF on words and word pairs, sublinear term counts, then logistic
// regression with C = 8), and it produces the same shape of model that baseline.js reads, so the
// demo and "your own messages" share one predict(). Nothing leaves the browser.

const TOKEN = /[\p{L}\p{N}_]{2,}/gu;   // scikit-learn's default token pattern, \b\w\w+\b

export function grams(text) {
  const words = String(text).toLowerCase().match(TOKEN) || [];
  const out = [...words];
  for (let i = 0; i + 1 < words.length; i++) out.push(words[i] + " " + words[i + 1]);
  return out;
}

// A small, seeded random number generator, so a split is the same every time for the same file.
export function seeded(seed = 7) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle(list, rand = seeded()) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// texts: string[], labels: string[] (team ids), classes: the team ids, in a fixed order.
// Returns { classes, terms, idf, coef, intercept }.
export async function train(texts, labels, classes, { C = 8, maxFeatures = 6000, epochs = 300, onProgress } = {}) {
  const n = texts.length;
  if (!n) throw new Error("Nothing to learn from");
  const docs = texts.map(grams);
  // vocabulary: terms in at least min_df messages (2, like the Python model, once there's enough
  // to learn from), keeping the most frequent when there are too many
  const minDf = n >= 50 ? 2 : 1;
  const df = new Map(), total = new Map();
  for (const d of docs) {
    for (const g of new Set(d)) df.set(g, (df.get(g) || 0) + 1);
    for (const g of d) total.set(g, (total.get(g) || 0) + 1);
  }
  let terms = [...df.keys()].filter((g) => df.get(g) >= minDf);
  if (terms.length > maxFeatures) terms = terms.sort((a, b) => total.get(b) - total.get(a) || (a < b ? -1 : 1)).slice(0, maxFeatures);
  terms.sort();
  const index = new Map(terms.map((t, i) => [t, i]));
  const idf = terms.map((t) => Math.log((1 + n) / (1 + df.get(t))) + 1);   // smooth idf, as scikit-learn

  // each message as a sparse, unit-length vector: [[term, value], ...]
  const X = docs.map((d) => {
    const tf = new Map();
    for (const g of d) { const j = index.get(g); if (j !== undefined) tf.set(j, (tf.get(j) || 0) + 1); }
    let norm = 0; const v = [];
    for (const [j, c] of tf) { const x = (1 + Math.log(c)) * idf[j]; v.push([j, x]); norm += x * x; }
    norm = Math.sqrt(norm) || 1;
    return v.map(([j, x]) => [j, x / norm]);
  });
  const K = classes.length, V = terms.length;
  const y = labels.map((l) => classes.indexOf(l));
  if (y.some((c) => c < 0)) throw new Error("A label isn't one of the teams");

  // multinomial logistic regression: minimise C * sum(cross-entropy) + 0.5 * |W|^2, by full-batch
  // gradient descent with Adam. Small data, so a few hundred passes settle it.
  const W = Array.from({ length: K }, () => new Float64Array(V)), b = new Float64Array(K);
  const mW = W.map(() => new Float64Array(V)), vW = W.map(() => new Float64Array(V)), mb = new Float64Array(K), vb = new Float64Array(K);
  const lr = 0.08, b1 = 0.9, b2 = 0.999, eps = 1e-8;
  const scale = 1 / n;   // the loss is divided by n throughout, so the penalty becomes 0.5|W|^2 / (C n)
  const lam = 1 / (C * n);
  for (let ep = 1; ep <= epochs; ep++) {
    const gW = W.map(() => new Float64Array(V)), gb = new Float64Array(K);
    for (let i = 0; i < n; i++) {
      const z = new Float64Array(K);
      for (let c = 0; c < K; c++) { let s = b[c]; const w = W[c]; for (const [j, x] of X[i]) s += w[j] * x; z[c] = s; }
      const mx = Math.max(...z); let sum = 0;
      for (let c = 0; c < K; c++) { z[c] = Math.exp(z[c] - mx); sum += z[c]; }
      for (let c = 0; c < K; c++) {
        const g = (z[c] / sum - (c === y[i] ? 1 : 0)) * scale;
        gb[c] += g; const gw = gW[c]; for (const [j, x] of X[i]) gw[j] += g * x;
      }
    }
    const c1 = 1 - b1 ** ep, c2 = 1 - b2 ** ep;
    for (let c = 0; c < K; c++) {
      const w = W[c], gw = gW[c], m = mW[c], v = vW[c];
      for (let j = 0; j < V; j++) {
        const g = gw[j] + lam * w[j];
        m[j] = b1 * m[j] + (1 - b1) * g; v[j] = b2 * v[j] + (1 - b2) * g * g;
        w[j] -= lr * (m[j] / c1) / (Math.sqrt(v[j] / c2) + eps);
      }
      mb[c] = b1 * mb[c] + (1 - b1) * gb[c]; vb[c] = b2 * vb[c] + (1 - b2) * gb[c] * gb[c];
      b[c] -= lr * (mb[c] / c1) / (Math.sqrt(vb[c] / c2) + eps);
    }
    // every few passes, give the page a moment so it stays responsive
    if (ep % 10 === 0) { if (onProgress) onProgress(ep / epochs); await new Promise((r) => setTimeout(r, 0)); }
  }
  return { classes: [...classes], terms, idf, coef: W.map((w) => Array.from(w)), intercept: Array.from(b) };
}

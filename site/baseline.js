// The second opinion, run in the browser: the same TF-IDF + logistic regression that
// pipeline/baseline.py trained, with the same steps, so it gives the same answer as Python.
// It never sees the AI's answer and the AI never sees its answer.

const TOKEN = /[\p{L}\p{N}_]{2,}/gu;   // scikit-learn's default token pattern, \b\w\w+\b

export function load(model) {
  const index = new Map(model.terms.map((t, i) => [t, i]));
  return { ...model, index };
}

// scores for each team, highest first: [{ team, p }]
export function predict(m, text) {
  const words = String(text).toLowerCase().match(TOKEN) || [];
  const grams = [...words];
  for (let i = 0; i + 1 < words.length; i++) grams.push(words[i] + " " + words[i + 1]);
  const tf = new Map();
  for (const g of grams) { const j = m.index.get(g); if (j !== undefined) tf.set(j, (tf.get(j) || 0) + 1); }
  // sublinear tf, times idf, then scaled to unit length
  const x = new Map();
  let norm = 0;
  for (const [j, n] of tf) { const v = (1 + Math.log(n)) * m.idf[j]; x.set(j, v); norm += v * v; }
  norm = Math.sqrt(norm) || 1;
  const z = m.coef.map((row, c) => { let s = m.intercept[c]; for (const [j, v] of x) s += row[j] * v / norm; return s; });
  const max = Math.max(...z), e = z.map((v) => Math.exp(v - max)), sum = e.reduce((a, b) => a + b, 0);
  return m.classes.map((team, c) => ({ team, p: e[c] / sum })).sort((a, b) => b.p - a.p);
}

"""The second opinion: a plain word-based model (TF-IDF + logistic regression) trained on Banking77's
10,003 training messages, scored on its 3,080 test messages, then exported so the page can run it in
the visitor's browser (site/baseline.js does the same maths). No AI, no server.

Run: python pipeline/baseline.py
"""
import csv
import json
import sys
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, str(Path(__file__).parent))
from teams import TEAM_OF, TEAMS  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ORDER = list(TEAMS)                       # class order, fixed so the export is stable
TOKEN = r"(?u)\b\w\w+\b"                  # scikit-learn's default; baseline.js matches it


def load(split):
    rows = list(csv.DictReader(open(ROOT / f"data/banking77/{split}.csv", encoding="utf-8")))
    return [r["text"] for r in rows], [ORDER.index(TEAM_OF[r["category"]]) for r in rows], [r["category"] for r in rows]


def train():
    texts, y, _ = load("train")
    vec = TfidfVectorizer(lowercase=True, token_pattern=TOKEN, ngram_range=(1, 2), min_df=2, sublinear_tf=True, max_features=6000)
    X = vec.fit_transform(texts)
    clf = LogisticRegression(C=8.0, max_iter=3000)
    clf.fit(X, y)
    return vec, clf


def main():
    vec, clf = train()
    texts, y, _ = load("test")
    pred = clf.predict(vec.transform(texts))
    acc = sum(int(p == t) for p, t in zip(pred, y)) / len(y)
    print(f"baseline team accuracy on the 3,080 test messages: {acc:.1%}")
    vocab = sorted(vec.vocabulary_.items(), key=lambda kv: kv[1])
    model = {
        "about": "TF-IDF (words and word pairs) + logistic regression, trained on Banking77's training split.",
        "classes": ORDER,
        "terms": [t for t, _ in vocab],
        "idf": [round(float(v), 5) for v in vec.idf_],
        "coef": [[round(float(w), 4) for w in row] for row in clf.coef_],
        "intercept": [round(float(b), 4) for b in clf.intercept_],
        "test_accuracy": round(acc, 4),
    }
    out = ROOT / "site/data/baseline.json"
    out.write_text(json.dumps(model, separators=(",", ":")))
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB, {len(vocab)} terms)")


if __name__ == "__main__":
    main()

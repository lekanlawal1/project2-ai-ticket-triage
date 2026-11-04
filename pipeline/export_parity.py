"""Writes Python's baseline predictions for every test message, so the JS test can check it agrees."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from baseline import train, load, ORDER, ROOT  # noqa: E402
vec, clf = train()
texts, y, _ = load("test")
proba = clf.predict_proba(vec.transform(texts))
rows = [{"text": t, "team": ORDER[int(p.argmax())], "p": round(float(p.max()), 4)} for t, p in zip(texts, proba)]
(ROOT / "tests").mkdir(exist_ok=True)
(ROOT / "tests/baseline_parity.json").write_text(json.dumps(rows))
print(len(rows), "rows")

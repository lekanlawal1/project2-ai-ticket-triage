"""Picks the scoring sample: 10 test messages from each of the 77 request types (770 in all), with a
fixed seed so it never changes. Every kind of request counts equally, rare ones included."""
import csv, json, random, sys
from collections import defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from teams import TEAM_OF, priority_of  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
by = defaultdict(list)
for i, r in enumerate(csv.DictReader(open(ROOT / "data/banking77/test.csv", encoding="utf-8"))):
    by[r["category"]].append((i, r["text"]))
rng = random.Random(77)
rows = []
for intent in sorted(by):
    for i, text in sorted(rng.sample(by[intent], 10)):
        rows.append({"id": i, "text": text, "intent": intent, "team": TEAM_OF[intent], "priority": priority_of(intent)})
(ROOT / "data/eval_sample.json").write_text(json.dumps(rows, indent=0))
print(len(rows), "messages")

"""Batch-triage every ticket in data/tickets.csv through the TriageEngine.

Free-tier realities shape this script:
- Gemini 3 Flash free tier allows ~10 requests/min and a daily cap, so calls
  are throttled (THROTTLE_S between requests) and the run is RESUMABLE: results
  append to output/triage_results.csv and already-done ticket_ids are skipped,
  so a rate-limit abort or daily-cap cutoff costs nothing but time.
- Ground-truth columns are excluded from what the model sees — it gets only
  subject and body, exactly what a production system would have.

Outputs:
  output/triage_results.csv  — one row per ticket with the triage decision
  output/review_queue.jsonl  — every ticket routed to human_review, with reason
"""

import csv
import json
import os
import time
from pathlib import Path

from triage import TriageEngine

ROOT = Path(__file__).resolve().parent.parent
TICKETS = ROOT / "data" / "tickets.csv"
RESULTS = ROOT / "output" / "triage_results.csv"
REVIEW_QUEUE = ROOT / "output" / "review_queue.jsonl"

# ~9 req/min default, safely under the free tier's 10/min.
# On a billed key the limits are far higher: THROTTLE_S=0.5 finishes in ~3 min.
THROTTLE_S = float(os.environ.get("THROTTLE_S", "6.5"))

RESULT_FIELDS = ["ticket_id", "category", "priority", "confidence",
                 "routing_recommendation", "auto_routed", "route",
                 "status", "failure_reason", "attempts", "latency_s"]


def already_done() -> set[str]:
    if not RESULTS.exists():
        return set()
    with open(RESULTS, newline="", encoding="utf-8") as f:
        return {row["ticket_id"] for row in csv.DictReader(f)}


def main():
    engine = TriageEngine()
    with open(TICKETS, newline="", encoding="utf-8") as f:
        tickets = list(csv.DictReader(f))

    done = already_done()
    todo = [t for t in tickets if t["ticket_id"] not in done]
    print(f"{len(tickets)} tickets total, {len(done)} already processed, {len(todo)} to go")
    if not todo:
        return

    RESULTS.parent.mkdir(exist_ok=True)
    write_header = not RESULTS.exists()
    with open(RESULTS, "a", newline="", encoding="utf-8") as rf, \
         open(REVIEW_QUEUE, "a", encoding="utf-8") as qf:
        writer = csv.DictWriter(rf, fieldnames=RESULT_FIELDS)
        if write_header:
            writer.writeheader()

        for i, t in enumerate(todo, 1):
            start = time.time()
            result = engine.classify(t["subject"], t["body"])
            result["latency_s"] = round(time.time() - start, 2)
            result["ticket_id"] = t["ticket_id"]
            writer.writerow(result)
            rf.flush()  # survive an interrupt mid-run

            if result["route"] == "human_review":
                qf.write(json.dumps({
                    "ticket_id": t["ticket_id"],
                    "subject": t["subject"],
                    "reason": result["failure_reason"],
                    "model_guess": result["category"],
                    "confidence": result["confidence"],
                }) + "\n")
                qf.flush()

            flag = "→ HUMAN" if result["route"] == "human_review" else ""
            print(f"[{i}/{len(todo)}] {t['ticket_id']} {result['category'] or 'FAILED'}"
                  f"/{result['priority'] or '-'} conf={result['confidence']} {flag}")
            if i < len(todo):
                time.sleep(THROTTLE_S)

    print(f"\nDone. Results: {RESULTS}\nReview queue: {REVIEW_QUEUE}")


if __name__ == "__main__":
    main()

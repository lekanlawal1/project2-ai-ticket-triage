"""Score the pipeline against ground truth and write output/eval_report.md.

What gets measured, and why it's framed this way:
- Category accuracy on AUTO-ROUTED tickets is the number that matters — those are
  the ones no human checks. Overall accuracy alone would hide whether the
  confidence gate is doing its job.
- Ambiguous tickets are reported separately: they were planted to be hard, and
  the *correct* system behavior is routing them to a human, not guessing right.
- Confidence calibration table (accuracy per confidence bucket) justifies the
  0.75 threshold empirically instead of hand-waving it.
- Priority is scored as exact-match and as within-one-level, because adjacent
  priority disagreement (high vs medium) is a judgment call even between humans.
"""

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
PRIORITY_ORDER = {"low": 0, "medium": 1, "high": 2, "urgent": 3}


def main():
    truth = pd.read_csv(ROOT / "data" / "tickets.csv")
    results = pd.read_csv(ROOT / "output" / "triage_results.csv")
    df = truth.merge(results, on="ticket_id", how="inner")
    ok = df[df["status"] == "ok"].copy()
    ok["cat_correct"] = ok["category"] == ok["true_category"]
    ok["pri_correct"] = ok["priority"] == ok["true_priority"]
    ok["pri_within_one"] = (
        (ok["priority"].map(PRIORITY_ORDER) - ok["true_priority"].map(PRIORITY_ORDER))
        .abs() <= 1)

    auto = ok[ok["auto_routed"]]
    review = df[df["route"] == "human_review"]
    clear = ok[ok["is_ambiguous"] == 0]
    amb = ok[ok["is_ambiguous"] == 1]

    lines = ["# Evaluation Report", "",
             f"Scored {len(df)} tickets ({df['status'].eq('fallback').sum()} API fallbacks).", ""]

    lines += [
        "## Headline numbers", "",
        "| Metric | Value |", "|---|---|",
        f"| Category accuracy — auto-routed tickets (no human sees these) | **{auto['cat_correct'].mean():.1%}** ({auto['cat_correct'].sum()}/{len(auto)}) |",
        f"| Category accuracy — all classified tickets | {ok['cat_correct'].mean():.1%} ({ok['cat_correct'].sum()}/{len(ok)}) |",
        f"| Sent to human review | {len(review)}/{len(df)} ({len(review)/len(df):.1%}) |",
        f"| Priority exact match | {ok['pri_correct'].mean():.1%} |",
        f"| Priority within one level | {ok['pri_within_one'].mean():.1%} |",
        f"| Accuracy on clear tickets | {clear['cat_correct'].mean():.1%} |",
        f"| Accuracy on deliberately ambiguous tickets | {amb['cat_correct'].mean():.1%} ({len(amb)} classified, {int(truth['is_ambiguous'].sum()) - len(amb)} routed to humans) |",
        ""]

    lines += ["## Confidence calibration (justifies the 0.75 threshold)", "",
              "| Confidence bucket | Tickets | Category accuracy |", "|---|---|---|"]
    buckets = [(0.0, 0.5), (0.5, 0.75), (0.75, 0.9), (0.9, 1.01)]
    for lo, hi in buckets:
        b = ok[(ok["confidence"] >= lo) & (ok["confidence"] < hi)]
        acc = f"{b['cat_correct'].mean():.1%}" if len(b) else "—"
        lines.append(f"| {lo:.2f}–{min(hi, 1.0):.2f} | {len(b)} | {acc} |")
    lines.append("")

    lines += ["## Per-category accuracy (auto-routed)", "",
              "| True category | Tickets | Accuracy |", "|---|---|---|"]
    for cat, grp in auto.groupby("true_category"):
        lines.append(f"| {cat} | {len(grp)} | {grp['cat_correct'].mean():.1%} |")
    lines.append("")

    wrong = ok[~ok["cat_correct"]]
    lines += ["## Misclassifications (all)", "",
              "| Ticket | Subject | Truth | Model | Conf | Auto-routed? |", "|---|---|---|---|---|---|"]
    for _, r in wrong.iterrows():
        subj = str(r["subject"])[:48]
        lines.append(f"| {r['ticket_id']} | {subj} | {r['true_category']} | "
                     f"{r['category']} | {r['confidence']:.2f} | {'⚠️ yes' if r['auto_routed'] else 'no — caught'} |")
    lines.append("")

    out = ROOT / "output" / "eval_report.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines[:20]))
    print(f"\nFull report: {out}")


if __name__ == "__main__":
    main()

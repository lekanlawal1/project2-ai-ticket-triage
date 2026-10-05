# Before / After: Time-Savings Estimate

Showing the math, not just the headline — every input is either cited or
labeled as an assumption you can swap out.

## Baseline: what manual triage costs

Industry figures for the *triage step alone* (read → categorize → prioritize → route,
before anyone starts solving):

- Vendor benchmarks put manual categorization at **3–8 minutes** and routing
  decisions at 5–12 minutes per ticket ([DevRev](https://devrev.ai/blog/ai-support-ticket-triaging),
  [GiantRocketship](https://giantrocketship.com/blog/the-5-minute-ticket-why-your-triage-process-costs-more-than-you-think)).
- A peer-reviewed study of Adobe's e-commerce operations measured **18 minutes**
  (engineer triage) to **33 minutes** (support-analyst triage) for complex
  alerts/tickets ([arXiv:2602.02585](https://arxiv.org/pdf/2602.02585)).

**Chosen baseline: 4 minutes/ticket** — the low end of the vendor range,
deliberately conservative (a defensible floor, not an impressive-looking
average). Sensitivity to this choice is shown below. *Caveat I'd volunteer in
an interview: the 3–8 min figures come from automation vendors with an
incentive to inflate them, which is exactly why I anchored on the bottom of
the range; the arXiv figure is independent but measures a more complex
enterprise workflow.*

## Scenario: 1,000 tickets/month

A support desk at ~50 tickets/business day. All figures monthly.

**Before (fully manual):**

```
1,000 tickets × 4 min = 4,000 min ≈ 66.7 hours
```

**After (pipeline + human review of the low-confidence subset):**

| Component | Math | Hours |
|---|---|---|
| Auto-routed tickets — human time | ~0 min each | 0 |
| Human review queue (**r = 5.8% measured** in the evaluated run — `output/eval_report.md`) | 1,000 × 5.8% × 4 min | 3.9 |
| QA spot-check of auto-routed (5% sample, 1 min each — you audit an automated system, you don't trust it blind) | 942 × 5% × 1 min | 0.8 |
| **Total** | | **≈ 4.7** |

**Saved: ≈ 62 hours/month (93% reduction)** at the measured review rate.

At a support-agent loaded cost of CA$30/hour (mid-range for Canadian Tier-1
support, assumption): **≈ CA$1,860/month ≈ CA$22K/year**, or roughly a third
of a full-time role redirected from sorting tickets to solving them.

*Why the sensitivity table below still uses higher review rates (10–25%): the
5.8% was measured on synthetic data where the model runs hot on confidence —
production tickets are messier, and the error-handling doc argues the
threshold should probably be tightened, which raises r. Treat 5.8% as the
optimistic bound and the table as the defensible range.*

Pipeline compute cost: $0 on the free tier at this volume's rate; at paid-tier
Gemini Flash pricing this workload is on the order of a few dollars/month —
negligible against the labor line.

## Sensitivity table (defend any cell)

Hours saved per month, varying the two contested inputs:

| | r=10% | r=15% | r=25% |
|---|---|---|---|
| **3 min/ticket** | 44.3 | 41.8 | 36.8 |
| **4 min/ticket** | 59.3 | 56.0 | 49.3 |
| **8 min/ticket** | 119.3 | 112.7 | 99.3 |

Even the worst cell (fast human triagers, high review rate) saves ~37
hours/month. The estimate is robust because the driver is structural: most
tickets are unambiguous, and the confidence gate concentrates human attention
on the minority that aren't.

## What this deliberately does NOT claim

- No resolution-time savings — this automates *triage only*; solving the
  ticket still takes as long as it takes.
- No headcount reduction claim — the honest framing is capacity reallocation.
- The review rate r is measured on synthetic data; the first month of
  production data would recalibrate it (and the confidence threshold with it).

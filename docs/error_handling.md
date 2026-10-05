# Error Handling — Engineering Around an Unreliable Component

The premise of this project: an LLM call is a network request to a
non-deterministic service that sometimes returns garbage, sometimes returns
nothing, and sometimes returns a confident wrong answer. Each failure mode
gets its own containment.

## Failure modes and their handling

| Failure mode | Detection | Handling | Where |
|---|---|---|---|
| **Confidently wrong / unsure classification** | Self-reported confidence < 0.75 | Ticket routes to `human_review` queue instead of a team queue; model's guess is logged as a *suggestion* for the reviewer | `TriageEngine._finalize` |
| **Malformed / truncated JSON** | `response.parsed is None`, or Pydantic validation fails (e.g. confidence outside 0–1) | Retry with backoff, up to 4 attempts | `TriageEngine.classify` |
| **Rate limit (429)** — a first-class concern on the free tier (10 req/min, daily cap), not an edge case | `APIError.code == 429` | Exponential backoff with jitter (5s → 10s → 20s → 40s); batch runner also throttles to ~9 req/min *proactively* so 429s are the exception | `_backoff` + `THROTTLE_S` in `run_pipeline.py` |
| **Server errors / timeouts (5xx, transport)** | `APIError.code >= 500`, transport exceptions | Same retry-with-backoff path | `TriageEngine.classify` |
| **Non-retryable client errors** (invalid key, bad request) | Other 4xx codes | Fail fast — retrying a bad key 4 times just wastes quota | `TriageEngine.classify` |
| **All retries exhausted** | 4 failed attempts | **Fallback result**: ticket lands in `human_review` with `status=fallback` and the failure reason. The pipeline never raises, never silently drops a ticket | end of `classify` |
| **Batch interrupted** (daily cap hit, Ctrl-C, crash) | — | Results flush to disk per-ticket; re-running skips already-processed ticket IDs and resumes | `run_pipeline.already_done` |

Every human-review routing — low confidence or hard failure — is appended to
`output/review_queue.jsonl` with the ticket, the reason, and the model's best
guess, so the review queue is a working to-do list, not just a log.

## The confidence gate, empirically

The 0.75 threshold isn't hand-picked — `output/eval_report.md` breaks accuracy
down by confidence bucket. The pattern the gate relies on: accuracy in the
≥0.9 bucket is far higher than in the 0.5–0.75 bucket. If those buckets ever
converge, the threshold (or the model) needs revisiting. See the calibration
table in the eval report for the current run's numbers.

## What happens when the AI gets it wrong

Real examples from the evaluated run over all 171 labeled tickets (0 API
fallbacks; full misclassification table in `output/eval_report.md`).

**Caught — the gate doing its job.** TKT-0120, subject "Question", body *"I
emailed last week about the thing we discussed on the call. Any update? This
is becoming urgent for us."* There is nothing in this ticket to classify. The
model guessed `technical_bug` but reported **0.20 confidence**, so the ticket
went to a human — the correct outcome for an unanswerable input. Similarly
TKT-0084 ("can't change my email address", 0.70) landed in review because it
sits legitimately between `account_access` and `technical_bug`.

**Uncaught — and systematic, which is the interesting part.** Eight tickets
of the form *"Sales promised features that don't exist"* or *"Extremely
disappointed with support response time"* (ground truth: `complaint`) were
filed as `billing` at 0.90–0.95 confidence. This is not random noise — it
traces directly to tie-breaking rule #1 in the system prompt: *"if any part
alleges wrong charges or money owed, prefer billing."* Complaints about
contracts, price increases, and billing-adjacent service failures all mention
money, so the rule over-fires. **A prompt rule I wrote to fix v1's
inconsistency introduced a systematic bias that evaluation exposed.** The fix
(v3, future work) is narrowing the rule to "a specific incorrect charge or
refund owed," and it would be validated the same way: against the labeled set.

**The honest limitation this run exposed:** the confidence gate catches
*vagueness*, not *systematic bias*. The calibration table shows ≥0.90
confidence running at 91% accuracy, but every complaint→billing error sat in
that bucket — the model isn't unsure when it's systematically wrong. That's
why a production rollout pairs the gate with a complementary control:
monitoring queue bounce rates (tickets re-routed by the receiving team), which
catches exactly the errors confidence can't. Priority classification tells the
same story at lower stakes: 64% exact agreement but **99.4% within one
level** — the model and the ground truth disagree on high-vs-medium judgment
calls, almost never on urgent-vs-low.

Two kinds of "wrong" matter differently:

1. **Caught wrong** — the model misreads a ticket but reports low confidence,
   so a human sees it. This is the system *working*: the cost is ~4 minutes of
   human time, identical to the pre-automation baseline for that ticket.
2. **Uncaught wrong** — misclassified *and* auto-routed with high confidence.
   This is the real error rate of the system, the number to minimize and
   monitor. The cost is a mis-routed ticket bouncing between queues.

The design goal is not zero errors — it's ensuring errors are overwhelmingly
of type 1, and type 2 stays measurable and small.

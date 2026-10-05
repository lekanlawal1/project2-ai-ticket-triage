# Prompt Engineering Log

Two iterations, documented the same way Project 1 documents cleaning decisions:
what was done, what broke, and why the fix is the fix.

## v1 — the naive prompt

```
You are a support assistant. Read the ticket and classify its category and
priority, and suggest where to route it.
```

(Kept in `src/triage.py` as `SYSTEM_PROMPT_V1` for reproducibility.)

### What broke in v1

| Failure | Example | Why it happens |
|---|---|---|
| **Invented categories** | Returned `payment_issue`, `bug_report`, `general_inquiry` — none of which are queues that exist | The prompt never enumerated the allowed set, so the model improvised labels per ticket. Downstream routing code can't switch on labels it has never seen. |
| **No confidence signal** | Every ticket got auto-routed, including `"nothing works. fix it."` | Nothing asked the model to express uncertainty, so there was no basis for a human-review gate — the single most important control in the system. |
| **Priority inflation** | `"URGENT!!!"` with no content → `urgent`; a typo report written politely → `medium` | Without a rubric, the model reads *tone* as *impact*. Customers who type in caps get faster service than customers with real outages. |
| **Spam misfiled as complaints** | SEO cold-emails → `complaint`, `high` priority | The model pattern-matched "unhappy-sounding external message" without criteria for *is this even a customer?* |
| **Mixed tickets flip-flopped** | "Can't log in since I disputed the invoice" → sometimes `billing`, sometimes `account_access` | No tie-breaking rules, so the classification depended on which sentence the model attended to. Inconsistency is worse than a documented wrong answer — it can't be audited. |

Structured output (`response_schema`) was **not** the fix for the invented
categories on its own — the schema *forces* a valid enum value, but forcing an
uninformed model to pick from an enum just converts hallucination into silent
misclassification. The schema constrains the output; the prompt has to inform
the choice.

## v2 — the production prompt

Full text in `src/triage.py` (`SYSTEM_PROMPT_V2`). Each change maps to a v1 failure:

1. **Closed category set with one-line definitions** → kills invented labels and gives the enum meaning.
2. **Tie-breaking rules for mixed tickets** (money-wins, compromise-always-wins, frustrated-tone-with-fixable-issue-is-not-a-complaint) → deterministic, auditable behavior on the hard cases.
3. **Priority rubric anchored to business impact** with an explicit instruction that capitalization and exclamation marks do not raise priority → measures impact, not volume.
4. **Honest-confidence instruction** ("a human only sees tickets you are unsure about, so an honest low confidence is more valuable than a confident guess") → makes low confidence a *correct answer* rather than a failure, which measurably changes behavior on vague tickets.
5. **Spam criteria** framed as "is this from a customer at all?" → separates angry customers from cold-emailers.
6. **`temperature: 0`** → classification wants repeatability; creative variance is a liability here.

## Structured output

The schema is a Pydantic model passed as `response_schema` (Gemini's native
JSON-schema mode) — the API returns a parsed, validated object, not prose:

```python
class TriageResult(BaseModel):
    category: Category            # enum of the 6 queues
    priority: Priority            # low / medium / high / urgent
    confidence: float             # 0.0–1.0, gated at 0.75
    routing_recommendation: str   # one sentence for the human reading the queue
```

If parsing fails anyway (truncated output, schema drift — rare but nonzero),
that's handled as a retryable error, not a crash: see
[error_handling.md](error_handling.md).

## A caveat I'd raise in an interview

The confidence score is **self-reported by the model, not a calibrated
probability**. The eval report's calibration table (`output/eval_report.md`)
checks empirically whether higher buckets are actually more accurate — that
table, not the model's say-so, is what justifies trusting the 0.75 threshold.
In a production system I'd recalibrate the threshold quarterly against the
human-review queue's outcomes.

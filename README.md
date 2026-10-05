# AI Support Ticket Triage — LLM Pipeline with Guardrails

**Live demo:** https://project2-ai-ticket-triage-ubf6qjhxmukei7tzjp5xgo.streamlit.app · **Stack:** Python · Gemini 3 Flash (structured output) · Streamlit · pandas

## Problem statement

Support desks burn 3–8 minutes of human attention per ticket just deciding *what it is and who should handle it* — before anyone starts solving anything. An LLM can do that first pass in seconds, but an LLM is an unreliable component: it hallucinates labels, inflates priorities for shouty customers, and returns confident nonsense on vague input. This project automates the triage step **and engineers around the unreliability** — the interesting part isn't the API call, it's everything wrapped around it.

## My approach

1. **Dataset** (`src/generate_tickets.py`): 171 synthetic tickets across 6 categories with ground-truth labels, generated with slot-filling + noise injection (typos, ALL-CAPS, vague one-liners). 15 are *deliberately ambiguous* — planted edge cases the system must handle honestly rather than guess at.
2. **Pipeline** (`src/triage.py`, `src/run_pipeline.py`): Gemini 3 Flash classifies category, priority, and routing via **enforced JSON schema** (`response_schema` + Pydantic — no free-text parsing), with a self-reported confidence score.
3. **Guardrails**: confidence below **0.75 → human review queue**, never auto-routed. Retries with exponential backoff for 429s/5xx/timeouts/malformed JSON; a fallback result if all retries fail — the batch never crashes and never silently drops a ticket. Resumable runs (free-tier daily caps are a design constraint, not a surprise).
4. **Evaluation** (`src/evaluate.py`): accuracy scored *separately* for auto-routed vs. human-reviewed and clear vs. ambiguous tickets, plus a confidence-calibration table that empirically justifies the threshold.

## Key decisions and why

- **Gemini 3 Flash free tier** — the zero-cost constraint forced first-class rate-limit engineering (throttling, backoff, resumability), which is exactly the skill the project demonstrates. A paid tier would have let me skip the most instructive part.
- **Schema-enforced output over prompt-and-parse** — v1 of the prompt invented category labels that don't exist as queues. The schema forces valid enums; the improved prompt makes the choice informed. Both iterations documented in [docs/prompt_engineering.md](docs/prompt_engineering.md).
- **Confidence gate over maximizing accuracy** — the design goal is not zero errors; it's that errors get *caught*. A misclassification with low confidence costs 4 minutes of human review (same as the pre-automation baseline). Only high-confidence errors are true failures, and they're measured in [output/eval_report.md](output/eval_report.md).
- **Self-reported confidence, empirically checked** — LLM confidence is not a calibrated probability, so the eval includes a calibration table (accuracy per confidence bucket). The table justifies the threshold; the model's say-so doesn't.
- **Streamlit over Flask/React** — one language across pipeline and demo, free GitHub-integrated hosting with a secrets manager. The project's point is AI-pipeline engineering, not front-end engineering.
- **Synthetic data over scraped** — no PII/licensing risk, and planted edge cases with clean ground truth make honest evaluation possible.

## Results (live evaluated run, all 171 tickets, 0 API failures)

- **90.1% category accuracy on auto-routed tickets** (145/161 — the ones no human checks); **5.8% routed to human review**; priority within one level **99.4%** of the time. Full breakdown: [output/eval_report.md](output/eval_report.md)
- **Evaluation caught a systematic prompt bug**: complaints that mention money ("sales promised features that don't exist") get filed as `billing` at 95% confidence — traceable to a tie-breaking rule I wrote, and invisible to the confidence gate. The gate catches *vagueness*, not *bias*; the write-up of what that means for production is in [docs/error_handling.md](docs/error_handling.md)
- Estimated impact at 1,000 tickets/month with the measured 5.8% review rate: **≈62 hours (~CA$1,860) of triage labor saved monthly** — math, citations, and sensitivity analysis in [docs/time_savings.md](docs/time_savings.md)

## Repo structure

```
data/tickets.csv           171 labeled synthetic tickets (ground truth for eval only)
src/generate_tickets.py    reproducible dataset generator (seeded)
src/triage.py              triage engine: schema, prompts v1+v2, retries, confidence gate
src/run_pipeline.py        throttled, resumable batch runner
src/evaluate.py            scores results vs ground truth → output/eval_report.md
app.py                     Streamlit demo (paste a ticket, watch the decision)
output/                    triage_results.csv · review_queue.jsonl · eval_report.md
docs/                      prompt_engineering.md · error_handling.md · time_savings.md · case_study.md
```

## Run it

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                      # paste your free key from aistudio.google.com/apikey
.venv/bin/python src/generate_tickets.py  # regenerate the dataset (deterministic)
.venv/bin/python src/run_pipeline.py      # batch triage (throttled; resumable if interrupted)
.venv/bin/python src/evaluate.py          # score it → output/eval_report.md
.venv/bin/streamlit run app.py            # local demo
```

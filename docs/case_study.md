# Case Study — AI-Powered Support Ticket Triage

**The problem.** Before a support ticket gets solved, someone has to read it,
decide what it is, how urgent it is, and who owns it — 3–8 minutes of skilled
attention per ticket that produces no resolution, just sorting. At 1,000
tickets a month, that's roughly 67 hours of labor spent before the real work
starts.

**The solution.** A Python pipeline that sends each ticket to Gemini 3 Flash
and gets back a schema-enforced classification: category, priority, one-line
routing recommendation, and a confidence score. The engineering premise is
that the LLM is an unreliable component: below 75% confidence a ticket is
never auto-routed — it goes to a human review queue with the model's guess
attached as a suggestion. Rate limits, timeouts, and malformed responses get
exponential-backoff retries; if everything fails, the ticket falls back to the
review queue with the reason logged. The batch never crashes and never
silently drops a ticket.

**The evidence.** Evaluated against 171 labeled synthetic tickets — including
15 deliberately ambiguous ones: **90.1% category accuracy on auto-routed
tickets**, a 5.8% human-review rate, and priority within one level 99.4% of
the time. The evaluation also surfaced a systematic prompt bug (money-adjacent
complaints misfiled as billing at 95% confidence) — proof that confidence
gates catch vagueness but not bias, and that shipping an LLM feature means
shipping its monitoring.

**The impact.** At a conservative 4 min/ticket baseline and the measured
review rate, the pipeline saves ≈62 hours (~CA$1,860) per 1,000 monthly
tickets — capacity redirected from sorting tickets to solving them. Full
math, citations, and sensitivity analysis in the repo.

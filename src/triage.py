"""Core triage engine: classify one support ticket with Gemini 3 Flash.

(Originally scoped for Gemini 2.5 Flash; that model has been retired for new
API keys. gemini-3.5-flash's free quota is just 20 requests/day — unworkable
for a batch this size — and gemini-2.0-flash / gemini-2.0-flash-lite returned
a hard 0-quota for this key's project. gemini-3-flash-preview is Google's
current recommended free-tier model: 1,500 requests/day, 10/min.)

Engineering stance: the LLM is an unreliable component. Everything here exists
to contain that unreliability:
  - structured output via response_schema (no free-text parsing)
  - self-reported confidence + a threshold gate → low confidence goes to humans
  - retry with exponential backoff on rate limits (429), server errors and timeouts
  - a fallback result (never an exception) so one bad ticket can't kill a batch
Prompt iterations live in docs/prompt_engineering.md; v1 is kept here for reproducibility.
"""

import enum
import os
import random
import time

from dotenv import load_dotenv
from google import genai
from google.genai import errors as genai_errors
from pydantic import BaseModel, Field

load_dotenv()

MODEL = "gemini-3-flash-preview"

# Below this confidence, a ticket is never auto-routed. 0.75 was chosen after
# inspecting the eval run: see docs/error_handling.md for the calibration table.
CONFIDENCE_THRESHOLD = 0.75

MAX_RETRIES = 4
BASE_BACKOFF_S = 5  # doubles each retry; free tier is 10 requests/min, so be patient


class Category(str, enum.Enum):
    billing = "billing"
    technical_bug = "technical_bug"
    account_access = "account_access"
    feature_request = "feature_request"
    complaint = "complaint"
    spam = "spam"


class Priority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class TriageResult(BaseModel):
    """Schema enforced on the model via response_schema — Gemini must return exactly this."""
    category: Category
    priority: Priority
    confidence: float = Field(ge=0.0, le=1.0,
                              description="How certain the classification is, 0.0-1.0")
    routing_recommendation: str = Field(
        description="One sentence: which team/queue should handle this and why")


# v1 — naive prompt, kept for the docs. What broke: invented categories
# ("payment_issue"), no confidence signal, priority inflation, spam classified
# as complaints. Details + examples in docs/prompt_engineering.md.
SYSTEM_PROMPT_V1 = (
    "You are a support assistant. Read the ticket and classify its category and "
    "priority, and suggest where to route it."
)

# v2 — final prompt: closed category set with definitions, priority rubric anchored
# to business impact, tie-breaking rules for mixed tickets, honest-confidence
# instruction, and explicit spam criteria.
SYSTEM_PROMPT_V2 = """You are the first-line triage system for a B2B SaaS support desk. \
For each ticket, classify it for routing. Your output is machine-processed — a human only \
sees tickets you are unsure about, so an honest low confidence is more valuable than a \
confident guess.

CATEGORIES (choose exactly one):
- billing: charges, refunds, invoices, subscription changes, cancellations, pricing questions
- technical_bug: something in the product is broken, erroring, wrong, or degraded
- account_access: login, password, 2FA, SSO, lockouts, user provisioning/deprovisioning, suspected compromise
- feature_request: asking for capability that doesn't exist (not something broken)
- complaint: primary purpose is expressing dissatisfaction (service quality, price fairness, support experience) rather than requesting a specific fix
- spam: unsolicited sales pitches, scams, phishing, or messages unrelated to being a customer

TIE-BREAKING for mixed tickets:
1. If any part alleges wrong charges or money owed, prefer billing — money errors have deadlines and compliance implications.
2. A frustrated tone with a concrete fixable issue is that issue's category, not complaint. Use complaint only when venting/escalating IS the point.
3. Suspected account compromise always wins over other signals.

PRIORITY (business impact, not the customer's tone):
- urgent: user fully blocked from working, suspected security breach, or data loss
- high: money is wrong, deadline at risk, many users affected, or churn threat from a paying customer
- medium: single user degraded but has a workaround; time-sensitive but not immediate
- low: questions, minor cosmetic issues, feature requests, spam
Capitalized words or exclamation marks alone do NOT raise priority.

CONFIDENCE: report your genuine certainty in the category assignment.
Use below 0.75 whenever the ticket is vague, contradictory, spans multiple plausible \
categories, or is too short to be sure — such tickets go to a human, which is the \
correct outcome. Never inflate confidence.

ROUTING_RECOMMENDATION: one sentence naming the team (Billing Ops, Engineering \
On-call, Security, Support Tier 1, Product, or None for spam) and the reason."""


class TriageEngine:
    def __init__(self, api_key: str | None = None,
                 threshold: float = CONFIDENCE_THRESHOLD):
        key = api_key or os.environ.get("GEMINI_API_KEY")
        if not key:
            raise RuntimeError(
                "GEMINI_API_KEY not set. Copy .env.example to .env and add your key "
                "(free at https://aistudio.google.com/apikey).")
        self.client = genai.Client(api_key=key)
        self.threshold = threshold

    def classify(self, subject: str, body: str) -> dict:
        """Classify one ticket. Always returns a dict — never raises on API trouble.

        Returns keys: category, priority, confidence, routing_recommendation,
        auto_routed (bool), route (final queue), status ('ok'|'fallback'),
        failure_reason (str|None), attempts (int).
        """
        prompt = f"Subject: {subject}\n\nBody:\n{body}"
        last_error = "unknown"
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = self.client.models.generate_content(
                    model=MODEL,
                    contents=prompt,
                    config={
                        "system_instruction": SYSTEM_PROMPT_V2,
                        "response_mime_type": "application/json",
                        "response_schema": TriageResult,
                        "temperature": 0,  # classification wants determinism, not creativity
                    },
                )
                # .parsed is None when the model returns malformed/truncated JSON
                # despite schema mode — rare but real. Pydantic also rejects
                # out-of-range confidence here. Treat both as retryable.
                result: TriageResult | None = response.parsed
                if result is None:
                    raise ValueError("response did not parse into TriageResult")
                return self._finalize(result, attempt)
            except genai_errors.APIError as e:
                last_error = f"api_error_{e.code}"
                if e.code == 429 or (e.code is not None and e.code >= 500):
                    self._backoff(attempt, e)
                    continue
                break  # 4xx other than 429 (bad key, bad request): retrying won't help
            except Exception as e:  # malformed output, timeouts, transport errors
                last_error = f"{type(e).__name__}: {e}"
                self._backoff(attempt, None)
                continue
        # Fallback: never crash the batch; the ticket goes to a human with the reason.
        return {
            "category": None, "priority": None, "confidence": 0.0,
            "routing_recommendation": "Automatic triage failed — needs manual review",
            "auto_routed": False, "route": "human_review",
            "status": "fallback", "failure_reason": last_error,
            "attempts": MAX_RETRIES,
        }

    def _finalize(self, result: TriageResult, attempts: int) -> dict:
        auto = result.confidence >= self.threshold
        return {
            "category": result.category.value,
            "priority": result.priority.value,
            "confidence": round(result.confidence, 3),
            "routing_recommendation": result.routing_recommendation,
            "auto_routed": auto,
            "route": result.category.value if auto else "human_review",
            "status": "ok",
            "failure_reason": None if auto else f"confidence {result.confidence:.2f} < {self.threshold}",
            "attempts": attempts,
        }

    @staticmethod
    def _backoff(attempt: int, api_error) -> None:
        if attempt >= MAX_RETRIES:
            return
        # Exponential backoff with jitter. On 429 the free tier resets per-minute,
        # so the wait is worth it; jitter avoids thundering-herd on retry.
        delay = BASE_BACKOFF_S * (2 ** (attempt - 1)) + random.uniform(0, 2)
        label = f"HTTP {api_error.code}" if api_error else "transient error"
        print(f"    {label} — retrying in {delay:.0f}s (attempt {attempt}/{MAX_RETRIES})")
        time.sleep(delay)

"""Streamlit demo: paste a support ticket, watch the triage decision happen live.

Why Streamlit (vs Flask/React): the pipeline is Python, Streamlit keeps the demo
in one language and one file, and Streamlit Community Cloud deploys free straight
from the GitHub repo with a built-in secrets manager for the API key — no
servers, no card on file. A React front end would show more front-end skill but
this project's point is AI-pipeline engineering, not UI engineering.
"""

import os
import sys
from pathlib import Path

import streamlit as st

sys.path.append(str(Path(__file__).parent / "src"))
from triage import CONFIDENCE_THRESHOLD, TriageEngine  # noqa: E402

st.set_page_config(page_title="AI Ticket Triage", page_icon="🎫", layout="centered")

st.title("🎫 AI Support Ticket Triage")
st.caption(
    "Gemini 3 Flash classifies the ticket (category · priority · routing) with a "
    f"confidence score. Below **{CONFIDENCE_THRESHOLD:.0%}** confidence, the ticket is "
    "sent to a human instead of auto-routed — the system is designed to know when not "
    "to trust itself. [Source & docs](https://github.com/lekanlawal1/project2-ai-ticket-triage)")

EXAMPLES = {
    "— pick an example or write your own —": ("", ""),
    "Clear-cut: double charge": (
        "Charged twice this month",
        "I was charged $49.99 twice on the same day for my Pro subscription. "
        "Please refund the duplicate. Invoices INV-10233 and INV-10234."),
    "Clear-cut: locked out before a demo": (
        "Locked out - too many login attempts",
        "I mistyped my password and now I'm locked out. Client demo in an hour and "
        "all my materials are in the app. Please unlock ASAP."),
    "Ambiguous: vague anger": (
        "it doesnt work",
        "nothing works. fix it."),
    "Ambiguous: billing or bug?": (
        "Wrong plan showing",
        "My account says Starter but I pay for Pro. Also, since when is there an ads "
        "banner? If I'm on the wrong plan that explains the missing features I "
        "reported last month."),
    "Spam: SEO pitch": (
        "Grow your business 10x",
        "Dear business owner, our award-winning SEO experts can help you dominate "
        "Google. Limited time offer - reply now for a free audit!!!"),
}

choice = st.selectbox("Try an example", list(EXAMPLES.keys()))
ex_subject, ex_body = EXAMPLES[choice]
subject = st.text_input("Subject", value=ex_subject)
body = st.text_area("Ticket body", value=ex_body, height=160)


def get_api_key() -> str | None:
    try:
        if "GEMINI_API_KEY" in st.secrets:  # Streamlit Cloud
            return st.secrets["GEMINI_API_KEY"]
    except FileNotFoundError:
        pass
    return os.environ.get("GEMINI_API_KEY")  # local .env / shell


if st.button("Triage this ticket", type="primary", disabled=not body.strip()):
    key = get_api_key()
    if not key:
        st.error("No `GEMINI_API_KEY` configured. Locally: copy `.env.example` to `.env`. "
                 "On Streamlit Cloud: add it under App settings → Secrets.")
        st.stop()
    with st.spinner("Classifying with Gemini 3 Flash…"):
        result = TriageEngine(api_key=key).classify(subject, body)

    if result["status"] == "fallback":
        st.warning(f"The API call failed after {result['attempts']} attempts "
                   f"(`{result['failure_reason']}`) — in production this ticket would "
                   "drop into the human review queue, not get lost. That fallback is "
                   "working as designed, even in this demo.")
        st.stop()

    c1, c2, c3 = st.columns(3)
    c1.metric("Category", result["category"].replace("_", " "))
    c2.metric("Priority", result["priority"].upper())
    c3.metric("Confidence", f"{result['confidence']:.0%}")

    st.progress(min(result["confidence"], 1.0),
                text=f"confidence vs. auto-route threshold ({CONFIDENCE_THRESHOLD:.0%})")

    if result["auto_routed"]:
        st.success(f"**Auto-routed → {result['route'].replace('_', ' ')} queue.** "
                   f"{result['routing_recommendation']}")
    else:
        st.warning(f"**Sent to human review** — {result['failure_reason']}. "
                   "The model's guess is shown above, but it isn't trusted to act alone "
                   "on this one. Suggested owner if confirmed: "
                   f"{result['routing_recommendation']}")

with st.expander("How the error handling works"):
    st.markdown(f"""
- **Structured output**: Gemini is forced into a JSON schema (`response_schema`) — no free-text parsing.
- **Confidence gate**: below {CONFIDENCE_THRESHOLD:.0%}, the ticket routes to `human_review` instead of a team queue.
- **Retries**: rate limits (429), 5xx errors, timeouts and malformed JSON each get up to 4 attempts with exponential backoff.
- **Fallback**: if all retries fail, the ticket lands in the review queue with the failure reason logged — the pipeline never crashes and never silently drops a ticket.

Evaluated on 171 labeled synthetic tickets: **90.1% category accuracy on auto-routed tickets**, 5.8% sent to human review — see `output/eval_report.md` in the repo for calibration and misclassification analysis.
""")

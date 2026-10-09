"""Gives the Streamlit app the look of the portfolio (lekanlawal1.github.io/portfolio-site):
cream paper, ink outlines with offset shadows, Bricolage Grotesque headings with Inter, a striped
band in the project's colour, and a link back to the portfolio.

Colours live in .streamlit/config.toml (Streamlit's own theme); this file only adds what the
theme cannot express: fonts, outlines, shadows and the top bar. Purely visual, no app logic.
"""

import streamlit as st

PORTFOLIO = "https://lekanlawal1.github.io/portfolio-site/"
INK = "#1D1535"


def apply(accent: str, anchor: str, case_study: str) -> None:
    """accent: the project's colour; anchor: its card id on the portfolio; case_study: page path."""
    # st.html injects the stylesheet as-is; st.markdown would run it through the markdown parser.
    st.html(f"""<style>
@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter:wght@400;500;600;700&display=swap");
.stApp {{ font-family: Inter, system-ui, sans-serif; }}
.stApp h1, .stApp h2, .stApp h3 {{ font-family: "Bricolage Grotesque", Inter, sans-serif; letter-spacing: -0.03em; font-weight: 800; }}
header[data-testid="stHeader"] {{ background: transparent; }}
.block-container {{ padding-top: 2.2rem; }}
.pf-bar {{ display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 0 0 6px; }}
.pf-bar a {{ color: {INK} !important; text-decoration: none !important; font-weight: 700; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; }}
.pf-bar a.pf-home {{ font-family: "Bricolage Grotesque", Inter, sans-serif; font-weight: 800; font-size: 17px; letter-spacing: -0.02em; }}
.pf-dot {{ width: 24px; height: 24px; border-radius: 7px; background: #FF5D3A; border: 2.5px solid {INK}; box-shadow: 2px 2px 0 {INK}; display: inline-grid; place-items: center; color: #fff; font-size: 10px; transform: rotate(-8deg); }}
.pf-pill {{ padding: 5px 12px; border: 2px solid {INK}; border-radius: 999px; background: #fff; box-shadow: 2px 2px 0 {INK}; }}
.pf-band {{ height: 12px; margin: 10px 0 18px; border: 2.5px solid {INK}; border-radius: 999px; background: #fff repeating-linear-gradient(-45deg, {accent} 0 12px, transparent 12px 24px); }}
[data-testid="stMetric"] {{ background: #fff; border: 2.5px solid {INK}; border-radius: 16px; padding: 12px 16px; box-shadow: 4px 4px 0 {INK}; }}
[data-testid="stMetricValue"] {{ font-family: "Bricolage Grotesque", Inter, sans-serif; font-weight: 800; }}
.stButton > button {{ border: 2.5px solid {INK}; border-radius: 12px; box-shadow: 3px 3px 0 {INK}; font-weight: 700; transition: transform .15s, box-shadow .15s; }}
.stButton > button:hover:enabled {{ transform: translate(-1px, -1px); box-shadow: 5px 5px 0 {INK}; }}
.stButton > button:active:enabled {{ transform: translate(2px, 2px); box-shadow: 1px 1px 0 {INK}; }}
.stButton > button:disabled {{ box-shadow: none; border-style: dashed; }}
[data-baseweb="input"], [data-baseweb="textarea"], [data-baseweb="select"] > div,
[data-testid="stTextInputRootElement"], [data-testid="stTextAreaRootElement"], [data-testid="stSelectbox"] div:has(> input) {{ border: 2px solid {INK} !important; border-radius: 12px !important; background: #fff !important; }}
[data-baseweb="input"] input, [data-baseweb="textarea"] textarea {{ background: #fff !important; }}
[data-testid="stExpander"] details {{ border: 2.5px solid {INK}; border-radius: 16px; background: #fff; box-shadow: 4px 4px 0 {INK}; }}
[data-testid="stAlert"] {{ border: 2px solid {INK}; border-radius: 14px; }}
[data-testid="stCode"], [data-testid="stDataFrame"] {{ border: 2px solid {INK}; border-radius: 12px; overflow: hidden; }}
.stApp a {{ color: {INK}; font-weight: 600; }}
</style>""")
    st.markdown(f"""<div class="pf-bar"><a class="pf-home" href="{PORTFOLIO}#{anchor}" target="_self"><span class="pf-dot">LL</span>&larr; Back to all projects</a><a class="pf-pill" href="{PORTFOLIO}{case_study}" target="_self">Case study</a></div><div class="pf-band"></div>""", unsafe_allow_html=True)

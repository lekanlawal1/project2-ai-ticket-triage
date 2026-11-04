# Inbox Departures: AI ticket triage for bank support

**Live demo:** https://lekanlawal1.github.io/project2-ai-ticket-triage/ · **Stack:** Gemini (structured output) · scikit-learn · JavaScript · Cloudflare Workers · GitHub Actions

Type a message a bank customer might send and watch it get routed to one of seven support teams, or held for a person. Or let the board replay hundreds of real test messages and keep score.

## The problem

A support desk spends minutes per message just deciding who should handle it. An AI can do that first pass in a second, but it's an unreliable part: it can be confidently wrong, and its own "how sure am I" doesn't catch that. The previous version of this project proved the point: it filed complaints that mentioned money as billing at 95% confidence, and the confidence check never noticed.

## How it works

1. **The AI reads the message.** Gemini returns a team, a priority, how sure it is, and the words that decided it, in a fixed JSON shape it can't step outside. Code checks that the quoted words are really in the message.
2. **A plain model reads it too.** TF-IDF and logistic regression, trained on Banking77's 10,003 training messages. It runs in the visitor's browser and never sees the AI's answer.
3. **Code decides.** A message goes straight to a team only when both pick the same team, the AI is at least 80% sure, and its quote checks out. Everything else goes to a person, with the reasons. The 80% bar was set before scoring and isn't tuned on the results.

## The data

[Banking77](https://github.com/PolyAI-LDN/task-specific-datasets) (PolyAI, CC BY 4.0): 13,083 customer messages to a bank, each labelled by people with one of 77 request types. I grouped the 77 types into seven teams a bank's support desk would have (Cards, Transfers, Top-ups, Cash and ATMs, Fees and exchange, Account and identity, Fraud and security) and set priorities by request type, before running any model. The grouping is in [pipeline/teams.py](pipeline/teams.py).

Unlike the first version of this project, nothing here is written by me: the messages and their labels are someone else's, so the scores can be checked.

## Scoring

The AI is scored on 770 test messages, 10 from each of the 77 request types, through the same code the live demo uses ([worker/src/triage.js](worker/src/triage.js)). The results, and every message with both opinions and the right answer, are in [site/data/](site/data/). The plain model gets 96.2% of all 3,080 test messages into the right team; it has seen 10,000 messages just like them, so the interesting questions are how often the AI and the plain model agree, how often they're both wrong together, and whether the AI's confidence means anything. The page answers all three.

## Run it

```bash
pip install -r pipeline/requirements.txt
python pipeline/baseline.py                          # train the plain model, export site/data/baseline.json
python pipeline/sample.py                            # the fixed 770-message scoring sample
GEMINI_API_KEY=... node pipeline/run_gemini.mjs      # ask Gemini (resumable; free tier is fine)
node pipeline/evaluate.mjs                           # score, write site/data/results.json and inbox.json
node --test tests/*.test.mjs worker/test/*.test.mjs  # tests
cd site && python -m http.server 8800                # the page, at http://localhost:8800
```

## Layout

```
pipeline/teams.py        the seven teams and which request types each handles
pipeline/baseline.py     trains and exports the plain model
pipeline/sample.py       the 770-message scoring sample
pipeline/run_gemini.mjs  the scoring run (same code as the live demo)
pipeline/evaluate.mjs    scores everything with the page's own code
worker/                  the Cloudflare Worker that holds the Gemini key
site/                    the page: baseline.js (plain model), rule.js (the decision), app.js
tests/                   the browser model matches Python on all 3,080 test messages; the decision rule
```

The first version (synthetic tickets, Streamlit) is in the git history.

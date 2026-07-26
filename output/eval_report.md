# Evaluation Report

Scored 171 tickets (0 API fallbacks).

## Headline numbers

| Metric | Value |
|---|---|
| Category accuracy — auto-routed tickets (no human sees these) | **90.1%** (145/161) |
| Category accuracy — all classified tickets | 89.5% (153/171) |
| Sent to human review | 10/171 (5.8%) |
| Priority exact match | 64.3% |
| Priority within one level | 99.4% |
| Accuracy on clear tickets | 90.4% |
| Accuracy on deliberately ambiguous tickets | 80.0% (15 classified, 0 routed to humans) |

## Confidence calibration (justifies the 0.75 threshold)

| Confidence bucket | Tickets | Category accuracy |
|---|---|---|
| 0.00–0.50 | 3 | 66.7% |
| 0.50–0.75 | 7 | 85.7% |
| 0.75–0.90 | 5 | 60.0% |
| 0.90–1.00 | 156 | 91.0% |

## Per-category accuracy (auto-routed)

| True category | Tickets | Accuracy |
|---|---|---|
| account_access | 29 | 86.2% |
| billing | 37 | 100.0% |
| complaint | 20 | 50.0% |
| feature_request | 24 | 100.0% |
| spam | 21 | 100.0% |
| technical_bug | 30 | 93.3% |

## Misclassifications (all)

| Ticket | Subject | Truth | Model | Conf | Auto-routed? |
|---|---|---|---|---|---|
| TKT-0009 | Sales promised features that don't exist | complaint | billing | 0.95 | ⚠️ yes |
| TKT-0016 | Extremely disappointed with support response tim | complaint | billing | 0.95 | ⚠️ yes |
| TKT-0025 | can't change my email address | account_access | technical_bug | 0.95 | ⚠️ yes |
| TKT-0045 | Extremely disappointed with support response tim | complaint | billing | 0.95 | ⚠️ yes |
| TKT-0062 | Extremely disappointed with support response tim | complaint | billing | 0.95 | ⚠️ yes |
| TKT-0066 | Can't change my email address | account_access | technical_bug | 0.90 | ⚠️ yes |
| TKT-0079 | Unhappy with recent price increase | complaint | billing | 0.80 | ⚠️ yes |
| TKT-0084 | can't change my email address | account_access | technical_bug | 0.70 | no — caught |
| TKT-0090 | Sales promised features that don't exist | complaint | billing | 0.95 | ⚠️ yes |
| TKT-0097 | Login problem after invoice | account_access | billing | 0.90 | ⚠️ yes |
| TKT-0106 | CAN'T CHANGE MY EMAIL ADDRESS | account_access | technical_bug | 0.95 | ⚠️ yes |
| TKT-0117 | sales promised features that don't exist | complaint | billing | 0.95 | ⚠️ yes |
| TKT-0120 | Question | complaint | technical_bug | 0.20 | no — caught |
| TKT-0123 | Sales promised features that don't exist | complaint | billing | 0.90 | ⚠️ yes |
| TKT-0124 | Your app deleted my data | technical_bug | account_access | 0.90 | ⚠️ yes |
| TKT-0139 | Extremely disappointed with support response tim | complaint | billing | 0.95 | ⚠️ yes |
| TKT-0140 | Unhappy with recent price increase | complaint | billing | 0.80 | ⚠️ yes |
| TKT-0159 | Data discrepancy between admin console and expor | technical_bug | billing | 0.95 | ⚠️ yes |

"""Generate a synthetic-but-realistic support ticket dataset with ground-truth labels.

Design decisions (mirrors the decision-log style of Project 1):
- Synthetic over scraped: real ticket dumps carry PII and licensing risk; synthetic
  data lets us plant known edge cases and hold clean ground truth for evaluation.
- Template pools + slot filling + noise injection (typos, ALL-CAPS, truncation)
  rather than uniform templates, so the LLM can't pattern-match on boilerplate.
- ~10% of tickets are deliberately ambiguous (mixed-signal or vague) and are
  flagged `is_ambiguous=1` so evaluation can report accuracy with and without them.
- Deterministic seed so the dataset is reproducible: re-running this script
  yields byte-identical output.

Output: data/tickets.csv with columns
  ticket_id, subject, body, true_category, true_priority, is_ambiguous
Ground-truth columns are used ONLY by the evaluator — the pipeline never sees them.
"""

import csv
import random
from pathlib import Path

random.seed(42)

OUT = Path(__file__).resolve().parent.parent / "data" / "tickets.csv"

FIRST = ["Sarah", "Mike", "Priya", "Dan", "Amara", "Chen", "Luis", "Kate", "Tunde", "Emily",
         "Raj", "Olivia", "Marc", "Fatima", "Josh", "Hannah", "Diego", "Ines", "Tom", "Zoe"]
PLAN = ["Starter", "Pro", "Team", "Enterprise"]
BROWSER = ["Chrome", "Safari", "Firefox", "Edge"]
FEATURE = ["dashboard", "export tool", "report builder", "API", "mobile app", "billing page",
           "integrations page", "search", "notifications", "admin console"]
ERRCODE = ["500", "502", "403", "ERR_TIMEOUT", "0x80070057", "CSV_PARSE_FAIL"]
AMOUNT = ["$29", "$49.99", "$120", "$299", "$1,188", "$79"]
MONTH = ["January", "February", "March", "April", "May", "June"]

# (subject_template, body_template, priority)
TEMPLATES = {
    "billing": [
        ("Charged twice this month",
         "Hi, I just checked my statement and I was charged {amount} twice on the same day for my {plan} subscription. Can you refund the duplicate charge? Invoice numbers are INV-{n1} and INV-{n2}.", "high"),
        ("Refund request - cancelled in {month}",
         "I cancelled my subscription in {month} but I'm still being billed {amount} every month. This is the third time I've contacted you about this. Please refund the charges since cancellation.", "high"),
        ("Question about invoice",
         "Hello, can you explain the line item 'usage overage' on invoice INV-{n1}? It's {amount} and I don't understand what it covers. Not urgent, just want to understand my bill.", "low"),
        ("Upgrade pricing question",
         "Hi there, we're thinking of moving from {plan} to Enterprise. Does the price change mid-cycle get prorated? Also is there a discount for annual billing? Thanks, {name}", "low"),
        ("Payment failed but card is fine",
         "My payment for this month failed with 'card declined' but my bank says the card is fine and has funds. I don't want to lose access. Can you retry the charge or let me pay another way?", "medium"),
        ("VAT number missing from invoices",
         "Our finance team needs our VAT number on invoices for tax filing. It's set in our profile but doesn't show up on the PDFs. Can this be fixed before the {month} invoice? Deadline is end of quarter.", "medium"),
        ("Cancel my subscription",
         "Please cancel my {plan} subscription effective immediately. The product is fine, we just no longer need it after our project ended. Confirm when done. {name}", "medium"),
        ("Charged after free trial - want refund",
         "I signed up for the free trial and forgot to cancel. I was just charged {amount}. I haven't used the product at all since the trial ended - can I get a refund? I know it's my fault but hoping you can help.", "medium"),
    ],
    "technical_bug": [
        ("{feature} down - error {err}",
         "The {feature} has been returning error {err} for the last two hours. Our whole team is blocked, we can't get anything out to our client. This is affecting a live deliverable due today. Please escalate.", "urgent"),
        ("Export produces corrupted file",
         "When I export from the {feature} the downloaded file won't open. Excel says it's corrupted. Tried in {browser} and {browser2}, same result. Started happening after yesterday's update I think.", "high"),
        ("Page freezes on load",
         "The {feature} freezes for about 30 seconds every time I open it, then works normally. Console shows error {err}. I'm on {browser}, happens on two different machines. Annoying but I can work around it.", "medium"),
        ("Charts render blank in {browser}",
         "All charts on the {feature} render as blank white boxes in {browser}. They work in {browser2}. No error message shown. Cleared cache already, no change.", "medium"),
        ("Typo in confirmation email",
         "Tiny thing - the confirmation email says 'Thank you for you purchase' (should be 'your'). Not a real problem, just thought you'd want to know since it looks unprofessional.", "low"),
        ("Data discrepancy between {feature} and export",
         "The totals shown in the {feature} don't match the CSV export - the export shows {amount} more revenue for {month}. One of them must be wrong and we use these numbers for board reporting. Which is correct?", "high"),
        ("API returning {err} intermittently",
         "About 1 in 20 calls to /v2/reports returns {err} since this morning. Our integration retries so nothing is broken yet, but error rate is climbing. Ticket ref from your status page incident?", "high"),
        ("Search returns no results for exact matches",
         "Searching for a record by its exact name in {feature} returns nothing, but I can find the same record by browsing. Reproducible for several records. {browser}, {plan} plan.", "medium"),
    ],
    "account_access": [
        ("Locked out - too many login attempts",
         "I mistyped my password a few times and now I'm locked out completely. I have a client demo in an hour and all my materials are in the app. Please unlock ASAP. Account email is {name lower}@example.com.", "urgent"),
        ("Password reset email never arrives",
         "I've requested a password reset four times and the email never arrives. Checked spam. Other emails from you arrive fine. Can you reset it manually or check if my address is blocked?", "high"),
        ("2FA phone number changed",
         "I got a new phone number and can no longer receive 2FA codes, so I can't log in. Old number is dead. What's the account recovery process? I can provide ID or billing details to verify.", "high"),
        ("Remove former employee's access",
         "{name} left our company last Friday and still has admin access to our workspace. Please deactivate their account. We should have caught this in offboarding - would like it done today for security.", "high"),
        ("Add new team member",
         "Hi, can you add {name lower}@example.com to our {plan} workspace as a viewer? No rush, they start next Monday. Thanks!", "low"),
        ("SSO login loop",
         "Since this morning, logging in via Google SSO just redirects back to the login page in a loop. Regular password login works, so I'm not blocked, but half our team only has SSO set up.", "high"),
        ("Can't change my email address",
         "I'm trying to change my account email from my old work address to my new one but the save button does nothing. No error, just nothing happens. {browser}. Not urgent yet but my old address expires end of {month}.", "medium"),
    ],
    "feature_request": [
        ("Feature request: dark mode",
         "Any plans for a dark mode? I use the {feature} for hours every day and the white background is rough in the evenings. Would happily beta test.", "low"),
        ("Request: scheduled exports",
         "It would save us a lot of time if the {feature} could email us a CSV export every Monday morning automatically. Right now someone does this manually every week. Is this on the roadmap?", "low"),
        ("Bulk edit would be huge for us",
         "We manage ~2,000 records and editing them one at a time is painful. Bulk edit (select multiple, change a field) would genuinely change how useful the product is for us. We'd upgrade to {plan} for this.", "medium"),
        ("Integration with QuickBooks?",
         "Our accountant asked if you integrate with QuickBooks. I see Xero on your integrations page but not QuickBooks. If it exists, where? If not, consider this a vote for it.", "low"),
        ("Keyboard shortcuts",
         "Power user request - keyboard shortcuts for common actions in the {feature} (save, new record, search). Even just a handful would speed up daily work a lot.", "low"),
        ("Export to PDF with our branding",
         "Clients receive the reports we export, and they currently have your logo on them. White-label or custom-branding on PDF exports would let us present these as our own deliverables. Happy to pay extra for it.", "medium"),
    ],
    "complaint": [
        ("Extremely disappointed with support response time",
         "I raised a ticket 6 days ago about a billing error and have heard nothing except the auto-reply. For {amount}/month I expect better. If I don't hear back this week I'm moving to a competitor and posting my experience on G2.", "high"),
        ("Product keeps getting worse",
         "Every update moves things around and removes features I use. The new {feature} redesign buried the export button three menus deep. Who is testing these changes with actual users? Genuinely frustrated after 3 years as a customer.", "medium"),
        ("Sales promised features that don't exist",
         "Your sales rep told us the {plan} plan included API access and priority support. After signing an annual contract we find API access is an add-on. This feels like bait and switch. I want someone from your team to call me.", "high"),
        ("Downtime is unacceptable",
         "This is the third outage this month. Each time your status page says 'investigating' for hours. We run client work on this platform and it's embarrassing. What is actually being done about reliability?", "high"),
        ("Unhappy with recent price increase",
         "A 40% price increase with one month's notice is not okay. I understand costs rise but this is steep and sudden, and grandfathering existing customers for a year would have been the fair move. Reconsidering our renewal in {month}.", "medium"),
    ],
    "spam": [
        ("Grow your business 10x with our SEO services",
         "Dear business owner, we noticed your website is not ranking on Google page 1. Our award-winning SEO experts can help you dominate search results. Limited time offer - reply now for a free audit!!!", "low"),
        ("Partnership opportunity",
         "Hello, I represent a network of premium influencers who can promote your product to 5M+ followers. This is a limited opportunity. Please share your WhatsApp number to discuss collaboration terms.", "low"),
        ("You've been selected!!!",
         "CONGRATULATIONS! Your company has been selected for our exclusive business directory. Claim your FREE listing now (worth $499). Click here before the offer expires in 24 hours.", "low"),
        ("Invoice attached",
         "Please find attached invoice for your recent order. Download the attachment and confirm payment details at your earliest convenience. [attachment: invoice_29381.zip.exe]", "low"),
        ("Re: your inquiry",
         "Good day, I am reaching out concerning an unclaimed fund of $4.7M belonging to a deceased client who shares your surname. I need a trustworthy foreign partner to facilitate the transfer. Strictly confidential.", "low"),
    ],
}

# Deliberately ambiguous tickets — the edge cases the pipeline must handle honestly.
# Labels reflect the *most defensible* reading; is_ambiguous=1 lets the evaluator
# report these separately.
AMBIGUOUS = [
    ("it doesnt work", "nothing works. fix it.", "technical_bug", "medium"),
    ("Question", "Hi, I emailed last week about the thing we discussed on the call. Any update? This is becoming urgent for us.", "complaint", "medium"),
    ("Billing bug?", "The billing page shows my next charge as {amount} but my plan is supposed to be {amount2}. Is this a display bug or am I actually being overcharged? If it's real money I need this fixed before the charge goes through Friday.", "billing", "high"),
    ("Cancel", "cancel", "billing", "medium"),
    ("Your app deleted my data",
     "I spent all day entering records and now they're GONE. Either your app has a catastrophic bug or my account was accessed by someone else. Fix this NOW or I'm done. I want my data back and an explanation.", "technical_bug", "urgent"),
    ("Login problem after invoice",
     "Ever since I disputed the last invoice I can't log in. Did you suspend my account over the dispute?? The charge was wrong in the first place. I need access restored and the billing issue fixed.", "account_access", "high"),
    ("Feedback", "The product is mostly fine I guess. The export thing could be better. Also you charged me on the wrong date this month but whatever, just letting you know.", "billing", "low"),
    ("hey", "hey is this the right place to ask about getting our data out before we leave? also who do I talk to about the contract", "billing", "medium"),
    ("URGENT!!!", "I need help immediately. Please call me at 555-0142. It's about my account.", "account_access", "medium"),
    ("Slow", "everything is slow today. is it me or you?", "technical_bug", "medium"),
    ("Wrong plan showing", "My account says Starter but I pay for Pro. Also, since when is there an ads banner? If I'm on the wrong plan that explains the missing features I reported last month that you closed as 'works as intended'.", "billing", "high"),
    ("Suggestion + problem", "Love the new dashboard! One thing - since the update my saved filters are gone. Not sure if that's a bug or the feature was removed. If removed, please bring it back, it was the main thing I used.", "technical_bug", "medium"),
    ("Do you have an office in Toronto",
     "Doing a story on Canadian SaaS companies, wondering if someone from your team is available for a quick interview this week. Deadline Thursday.", "spam", "low"),
    ("password", "i think someone has my password. weird logins in the activity page from another country. what do i do", "account_access", "urgent"),
    ("Invoice and a demo", "Two things: our {month} invoice hasn't arrived and finance is chasing me. And can someone demo the new API to our dev team? Trying to decide if we build the integration this quarter.", "billing", "medium"),
]

TYPO_SWAPS = [("the", "teh"), ("your", "you"), ("receive", "recieve"), ("does not", "doesnt"),
              ("I am", "im"), ("please", "pls"), ("account", "acount")]


def fill(text: str, rng: random.Random) -> str:
    name = rng.choice(FIRST)
    n1, n2 = rng.randint(10000, 99999), rng.randint(10000, 99999)
    b1, b2 = rng.sample(BROWSER, 2)
    a1, a2 = rng.sample(AMOUNT, 2)
    return (text.replace("{name lower}", name.lower())
                .replace("{name}", name)
                .replace("{plan}", rng.choice(PLAN))
                .replace("{browser2}", b2).replace("{browser}", b1)
                .replace("{feature}", rng.choice(FEATURE))
                .replace("{err}", rng.choice(ERRCODE))
                .replace("{amount2}", a2).replace("{amount}", a1)
                .replace("{month}", rng.choice(MONTH))
                .replace("{n1}", str(n1)).replace("{n2}", str(n2)))


def add_noise(subject: str, body: str, rng: random.Random):
    """Make a minority of tickets messier: typos, lowercase, caps subjects."""
    r = rng.random()
    if r < 0.15:
        for old, new in rng.sample(TYPO_SWAPS, 2):
            body = body.replace(old, new, 1)
    elif r < 0.22:
        subject, body = subject.lower(), body.lower()
    elif r < 0.27:
        subject = subject.upper()
    return subject, body


def main():
    rng = random.Random(42)
    rows = []
    # 4 variants of each template → 156 regular tickets, varied by slot-filling + noise
    for category, templates in TEMPLATES.items():
        for subj_t, body_t, priority in templates:
            for _ in range(4):
                subject, body = fill(subj_t, rng), fill(body_t, rng)
                subject, body = add_noise(subject, body, rng)
                rows.append((subject, body, category, priority, 0))
    for subj_t, body_t, category, priority in AMBIGUOUS:
        rows.append((fill(subj_t, rng), fill(body_t, rng), category, priority, 1))

    rng.shuffle(rows)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["ticket_id", "subject", "body", "true_category", "true_priority", "is_ambiguous"])
        for i, (subject, body, category, priority, amb) in enumerate(rows, 1):
            w.writerow([f"TKT-{i:04d}", subject, body, category, priority, amb])
    print(f"Wrote {len(rows)} tickets to {OUT} ({sum(r[4] for r in rows)} ambiguous)")


if __name__ == "__main__":
    main()

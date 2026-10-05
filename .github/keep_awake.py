"""Open the live Streamlit app in a real browser so Community Cloud doesn't put it to sleep.

A plain HTTP request doesn't count as a visit: the app only runs once a browser session
connects. If the app is already asleep, this clicks the wake button, then waits until the
app's own title appears, so a failed wake fails the workflow instead of passing silently.

Usage: python keep_awake.py <app url> <text that appears in the app once it has loaded>
"""

import sys
import time

from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

URL, READY_TEXT = sys.argv[1], sys.argv[2]
LOAD_TIMEOUT_S = 300  # waking a sleeping app can take a few minutes

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto(URL, wait_until="domcontentloaded", timeout=60_000)

    wake = page.get_by_role("button", name="Yes, get this app back up")
    try:
        wake.wait_for(timeout=15_000)
        wake.click()
        print("App was asleep; clicked the wake button.")
    except PlaywrightTimeout:
        print("App was awake.")

    # On Community Cloud the app itself renders inside an iframe, so check every frame.
    deadline = time.monotonic() + LOAD_TIMEOUT_S
    while time.monotonic() < deadline:
        if any(f.get_by_text(READY_TEXT).count() for f in page.frames):
            print(f"App loaded: found {READY_TEXT!r}.")
            break
        page.wait_for_timeout(5_000)
    else:
        page.screenshot(path="keep_awake_failure.png", full_page=True)
        sys.exit(f"App did not load within {LOAD_TIMEOUT_S} s.")

    browser.close()

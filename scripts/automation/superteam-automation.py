#!/usr/bin/env python3
"""
Superteam Earn Automation — عمالقة الصمت
$this script automates bounty submissions on Superteam Earn
using Playwright on ARM64 (aarch64)
"""

import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("❌ Playwright not installed. Run: pip3 install playwright")
    sys.exit(1)

# === CONFIG ===
HOME = Path(os.environ.get('HOME', '/root'))
SILENT_GIANTS = HOME / 'silent-giants'
DELIVERABLES = SILENT_GIANTS / 'deliverables'
SUBMISSIONS_DIR = DELIVERABLES / 'superteam-submissions'
AUDIT_LOG = DELIVERABLES / 'superteam-applications' / 'audit-log.md'
COOKIES_FILE = SILENT_GIANTS / 'scripts' / 'automation' / 'cookies.json'
SCREENSHOTS_DIR = DELIVERABLES / 'screenshots'

CHROMIUM_PATH = str(HOME / '.cache/ms-playwright/chromium-1234/chrome-linux/chrome')

BOUNTIES = [
    {
        'slug': 'zns-sol',
        'title': 'ZNS Solana Creator Challenge',
        'reward': '500 USDC',
        'task_id': 'TASK-408',
        'agent_access': 'AGENT_ALLOWED',
    },
    {
        'slug': 'solana-summit-canada-creator-challenge-part-1',
        'title': 'Solana Summit Canada Creator Challenge',
        'reward': '10,000 USDG',
        'task_id': 'TASK-409',
        'agent_access': 'HUMAN_ONLY',
    },
    {
        'slug': 'solana-summit-creator-grant',
        'title': 'Solana Summit Creator Grant',
        'reward': '2,000 USDG',
        'task_id': 'TASK-414',
        'agent_access': 'HUMAN_ONLY',
    },
    {
        'slug': 'create-content-to-engage-new-builders-for-the-hackathon',
        'title': 'Create Content for New Builders',
        'reward': '900 USDG',
        'task_id': 'TASK-423',
        'agent_access': 'HUMAN_ONLY',
    },
    {
        'slug': 'castledao-content-challenge',
        'title': 'CastleDAO Content Challenge',
        'reward': '1,000 USDG',
        'task_id': 'TASK-425',
        'agent_access': 'HUMAN_ONLY',
    },
]


def ensure_dirs():
    SUBMISSIONS_DIR.mkdir(parents=True, exist_ok=True)
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    (DELIVERABLES / 'superteam-applications').mkdir(parents=True, exist_ok=True)


def log_audit(bounty_title, task_id, status, note=''):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    entry = f"| {timestamp} | {bounty_title} | {task_id} | {status} | {note} |\n"
    with open(AUDIT_LOG, 'a') as f:
        f.write(entry)
    print(f"  📋 AUDIT: {bounty_title} → {status}")


def save_cookies(context):
    cookies = context.cookies()
    COOKIES_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(COOKIES_FILE, 'w') as f:
        json.dump(cookies, f, indent=2)
    print(f"  🍪 Cookies saved ({len(cookies)} cookies)")


def load_cookies(context):
    if COOKIES_FILE.exists():
        with open(COOKIES_FILE, 'r') as f:
            cookies = json.load(f)
        context.add_cookies(cookies)
        print(f"  🍪 Loaded {len(cookies)} stored cookies")
        return True
    return False


def take_screenshot(page, name):
    path = SCREENSHOTS_DIR / f"{name}.png"
    page.screenshot(path=str(path))
    print(f"  📸 Screenshot: {path}")
    return path


def check_login_status(page):
    """Check if user is logged in by looking for profile elements."""
    try:
        # Look for avatar or profile indicator (logged in users see their avatar)
        logged_in = page.evaluate('''() => {
            const avatar = document.querySelector('img[alt*="avatar"], img[alt*="profile"], [class*="avatar"]');
            const logoutBtn = document.querySelector('a[href*="signout"], button[class*="logout"]');
            return !!(avatar || logoutBtn);
        }''')
        return logged_in
    except Exception:
        return False


def login_with_twitter(page, context):
    """Attempt Twitter OAuth login."""
    print("\n🔑 Starting Twitter OAuth login...")

    # Navigate to login page
    page.goto('https://superteam.fun', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_timeout(3000)

    # Find and click login button
    login_btn = page.query_selector('a[href*="signin"], button:has-text("Login"), button:has-text("Sign")')
    if login_btn:
        print("  Found login button, clicking...")
        login_btn.click()
        page.wait_for_timeout(5000)
        take_screenshot(page, 'login-page')

        # Check if we're on Twitter OAuth page
        if 'twitter' in page.url.lower() or 'x.com' in page.url.lower():
            print("  ✅ On Twitter OAuth page")
            print("  ⚠️  Manual intervention required for Twitter login")
            print("  Please complete the login in the browser window")
            take_screenshot(page, 'twitter-oauth')

            # Wait for user to complete login (check every 5 seconds for 5 minutes)
            for i in range(60):
                page.wait_for_timeout(5000)
                current_url = page.url
                if 'superteam.fun' in current_url and 'signin' not in current_url:
                    print("  ✅ Login successful!")
                    save_cookies(context)
                    return True
                if i % 6 == 0:
                    print(f"  ⏳ Waiting for login... ({i * 5}s)")

            print("  ❌ Login timed out")
            return False
    else:
        print("  ❌ Login button not found")
        return False

    return False


def find_task_file(task_id):
    """Find the task file for a given task ID."""
    executed_dir = DELIVERABLES / 'executed'
    if not executed_dir.exists():
        return None

    for f in sorted(executed_dir.iterdir()):
        if f.name.startswith(task_id):
            return f
    return None


def submit_to_bounty(page, context, bounty):
    """Submit to a single bounty."""
    print(f"\n🎯 Submitting to: {bounty['title']} ({bounty['reward']})")

    url = f"https://superteam.fun/listings/{bounty['slug']}"
    page.goto(url, wait_until='domcontentloaded', timeout=60000)
    page.wait_for_timeout(5000)
    take_screenshot(page, f"bounty-{bounty['slug']}")

    # Check if we need to login
    if not check_login_status(page):
        print("  ❌ Not logged in")
        log_audit(bounty['title'], bounty['task_id'], 'BLOCKED', 'Not logged in')
        return False

    # Look for Apply button
    apply_btn = page.query_selector(
        'button:has-text("Apply"), a:has-text("Apply"), '
        'button:has-text("Submit"), a:has-text("Submit"), '
        '[class*="apply"], [class*="submit"]'
    )

    if not apply_btn:
        print("  ❌ Apply button not found")
        take_screenshot(page, f"no-apply-{bounty['slug']}")
        log_audit(bounty['title'], bounty['task_id'], 'NO_APPLY_BTN', 'Apply button not found')
        return False

    print("  ✅ Found Apply button, clicking...")
    apply_btn.click()
    page.wait_for_timeout(3000)
    take_screenshot(page, f"apply-clicked-{bounty['slug']}")

    # Look for file upload
    task_file = find_task_file(bounty['task_id'])
    if task_file:
        file_input = page.query_selector('input[type="file"]')
        if file_input:
            print(f"  📎 Uploading: {task_file.name}")
            file_input.upload_file(str(task_file))
            page.wait_for_timeout(2000)
        else:
            print("  ⚠️ No file input found — may need manual file upload")

    # Look for submit/confirm button
    submit_btn = page.query_selector(
        'button[type="submit"], button:has-text("Submit"), '
        'button:has-text("Confirm"), button:has-text("Send")'
    )

    if submit_btn:
        print("  ✅ Found Submit button, clicking...")
        submit_btn.click()
        page.wait_for_timeout(5000)
        take_screenshot(page, f"submitted-{bounty['slug']}")
        log_audit(bounty['title'], bounty['task_id'], 'SUBMITTED', 'File uploaded')
        print(f"  ✅ Submitted to {bounty['title']}!")
        return True
    else:
        print("  ⚠️ Submit button not found after Apply")
        take_screenshot(page, f"no-submit-{bounty['slug']}")
        log_audit(bounty['title'], bounty['task_id'], 'PARTIAL', 'Apply clicked, submit not found')
        return False


def main():
    ensure_dirs()

    print("=" * 60)
    print("🚀 Superteam Earn Automation — عمالقة الصمت")
    print(f"📅 {datetime.now().isoformat()}")
    print(f"🎯 Bounties: {len(BOUNTIES)}")
    print("=" * 60)

    with sync_playwright() as p:
        print("\n🌐 Launching browser...")
        browser = p.chromium.launch(
            headless=True,
            executable_path=CHROMIUM_PATH,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-web-security',
            ]
        )

        context = browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )

        # Load stored cookies
        load_cookies(context)

        page = context.new_page()

        # Navigate to Superteam
        print("\n📡 Connecting to Superteam Earn...")
        page.goto('https://superteam.fun', wait_until='domcontentloaded', timeout=60000)
        page.wait_for_timeout(5000)
        take_screenshot(page, 'homepage')

        # Check login status
        is_logged_in = check_login_status(page)
        print(f"\n{'✅' if is_logged_in else '❌'} Login status: {'Logged in' if is_logged_in else 'Not logged in'}")

        if not is_logged_in:
            print("\n⚠️  Twitter OAuth required for submission")
            print("    Run: python3 superteam-automation.py --login")
            print("    Or log in manually and re-run")
            log_audit('SYSTEM', 'N/A', 'AUTH_REQUIRED', 'Need Twitter OAuth login')
            browser.close()
            return

        # Submit to bounties
        results = {'submitted': 0, 'failed': 0, 'blocked': 0}

        for bounty in BOUNTIES:
            try:
                success = submit_to_bounty(page, context, bounty)
                if success:
                    results['submitted'] += 1
                else:
                    results['failed'] += 1
            except Exception as e:
                print(f"  ❌ Error: {e}")
                results['failed'] += 1
                log_audit(bounty['title'], bounty['task_id'], 'ERROR', str(e)[:100])

            time.sleep(2)  # Rate limit between submissions

        # Save cookies
        save_cookies(context)

        # Summary
        print("\n" + "=" * 60)
        print("📊 RESULTS SUMMARY")
        print("=" * 60)
        print(f"  ✅ Submitted: {results['submitted']}")
        print(f"  ❌ Failed: {results['failed']}")
        print(f"  ⏳ Blocked: {results['blocked']}")
        print(f"  📸 Screenshots: {SCREENSHOTS_DIR}")
        print(f"  📋 Audit log: {AUDIT_LOG}")

        browser.close()

    print("\n✅ Automation complete!")


if __name__ == '__main__':
    if '--login' in sys.argv:
        print("🔑 Login mode — Starting Twitter OAuth...")
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False,  # Show browser for manual login
                executable_path=CHROMIUM_PATH,
                args=['--no-sandbox', '--disable-setuid-sandbox']
            )
            context = browser.new_context()
            page = context.new_page()
            page.goto('https://superteam.fun', wait_until='domcontentloaded', timeout=60000)
            page.wait_for_timeout(3000)

            login_btn = page.query_selector('a[href*="signin"], button:has-text("Login")')
            if login_btn:
                login_btn.click()
                page.wait_for_timeout(5000)
                print("🔐 Complete Twitter login in the browser window...")
                print("   Waiting up to 5 minutes...")

                for i in range(60):
                    page.wait_for_timeout(5000)
                    if 'superteam.fun' in page.url and 'signin' not in page.url:
                        cookies = context.cookies()
                        COOKIES_FILE.parent.mkdir(parents=True, exist_ok=True)
                        with open(COOKIES_FILE, 'w') as f:
                            json.dump(cookies, f, indent=2)
                        print(f"✅ Login successful! Cookies saved ({len(cookies)} cookies)")
                        break
                    if i % 6 == 0:
                        print(f"   ⏳ Waiting... ({i * 5}s)")

            browser.close()
    else:
        main()

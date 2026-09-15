#!/usr/bin/env python3
"""Immunefi PoC Submission via Playwright"""
import asyncio
from playwright.async_api import async_playwright
import json
from datetime import datetime

REPORT_TITLE = "Missing Authorization in SecureSignatureContract"
SEVERITY = "High"
DESCRIPTION = """## Vulnerability: Missing Authorization Check

### Contract: SecureSignatureContract (axie10/off-chain-signatures)

### Summary
The `authorizeUser` function does not verify that the recovered signer matches `msg.sender` or a trusted authority. Any user can generate a valid signature using their own private key and authorize any arbitrary address.

### Vulnerable Code
```solidity
function authorizeUser(uint8 v, bytes32 r, bytes32 s, bytes32 hash, address user) external {
    address signer = ecrecover(hash, v, r, s);
    require(signer != address(0), "Invalid signature");
    require(!usedHashes[hash], "Hash already used");
    usedHashes[hash] = true;
    authorizedUsers[user] = true; // BUG: no check that signer == msg.sender
}
```

### Impact
- Any attacker can authorize themselves or any other address
- Complete bypass of the authorization system
- Attacker gains access to protected functions (e.g., `processData`)
- Mass authorization attack possible

### Proof of Concept
```solidity
function test_attack_authorize_self() public {
    bytes32 hash = keccak256(abi.encodePacked(attackerAddress, block.timestamp));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerPrivateKey, hash);
    target.authorizeUser(v, r, s, hash, attackerAddress);
    assertTrue(target.isAuthorized(attackerAddress));
}
```

### Recommendation
Add `require(signer == msg.sender, "Signer must be msg.sender");` after ecrecover.
"""

RESULT = {"submitted": False, "error": None, "timestamp": None}

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        try:
            # Step 1: Navigate to Immunefi
            print("[1/6] Navigating to Immunefi...")
            await page.goto("https://immunefi.com", timeout=30000)
            await page.wait_for_load_state("networkidle", timeout=15000)
            print(f"  Page title: {await page.title()}")
            
            # Step 2: Look for bounty programs or submit vulnerability link
            print("[2/6] Looking for submission options...")
            # Check for "Submit Vulnerability" or similar links
            submit_links = await page.query_selector_all('a[href*="submit"], a[href*="report"], a[href*="vulnerability"]')
            print(f"  Found {len(submit_links)} submission-related links")
            
            # Try to find bounty programs
            await page.goto("https://immunefi.com/bounties/", timeout=30000)
            await page.wait_for_load_state("networkidle", timeout=15000)
            print(f"  Bounties page title: {await page.title()}")
            
            # Look for search or filter
            search_input = await page.query_selector('input[type="search"], input[placeholder*="search"], input[placeholder*="Search"]')
            if search_input:
                print("  Found search input, searching for SecureSignature...")
                await search_input.fill("SecureSignature")
                await page.keyboard.press("Enter")
                await page.wait_for_timeout(3000)
            
            # Get page content for analysis
            content = await page.content()
            has_secure = "SecureSignature" in content or "secure" in content.lower()
            print(f"  Page contains 'SecureSignature': {has_secure}")
            
            # Try direct bounty page
            print("[3/6] Trying direct bounty pages...")
            bounty_urls = [
                "https://immunefi.com/bounty/secure-signature/",
                "https://immunefi.com/bounty/axie10/",
                "https://immunefi.com/bounty/off-chain-signatures/",
            ]
            
            for url in bounty_urls:
                try:
                    resp = await page.goto(url, timeout=10000)
                    if resp and resp.status == 200:
                        print(f"  Found bounty at: {url}")
                        break
                except:
                    continue
            
            # Try the general submit vulnerability page
            print("[4/6] Checking submit vulnerability page...")
            await page.goto("https://immunefi.com/submit/", timeout=15000)
            title = await page.title()
            print(f"  Submit page title: {title}")
            
            # Take screenshot for evidence
            await page.screenshot(path="/tmp/immunefi_screenshot.png", full_page=False)
            print("  Screenshot saved to /tmp/immunefi_screenshot.png")
            
            # Get all links on the page
            links = await page.eval_on_selector_all('a[href]', 'els => els.map(e => ({text: e.textContent.trim().slice(0,50), href: e.href}))')
            print(f"  Page links count: {len(links)}")
            for link in links[:10]:
                if any(kw in link.get('text','').lower() for kw in ['submit', 'report', 'vulnerability', 'bug', 'bounty']):
                    print(f"    -> {link['text']}: {link['href']}")
            
            RESULT["timestamp"] = datetime.utcnow().isoformat() + "Z"
            RESULT["page_title"] = title
            RESULT["links_found"] = len(links)
            RESULT["screenshot"] = "/tmp/immunefi_screenshot.png"
            
        except Exception as e:
            RESULT["error"] = str(e)
            print(f"ERROR: {e}")
        finally:
            await browser.close()
    
    # Save result
    with open("/tmp/immunefi_result.json", "w") as f:
        json.dump(RESULT, f, indent=2)
    print(f"\nResult saved: {json.dumps(RESULT, indent=2)}")

asyncio.run(main())

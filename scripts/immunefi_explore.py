#!/usr/bin/env python3
"""Explore Immunefi to find submission path"""
import asyncio
from playwright.async_api import async_playwright
import json

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        # Go to bug bounty programs page
        print("[1] Loading bug bounty programs...")
        await page.goto("https://immunefi.com/bug-bounty-program/", timeout=30000)
        await page.wait_for_load_state("networkidle", timeout=15000)
        
        # Get all program links
        programs = await page.eval_on_selector_all('a[href*="/bounty/"]', 
            'els => els.map(e => ({text: e.textContent.trim().slice(0,80), href: e.href}))')
        print(f"Found {len(programs)} bounty program links")
        for p_link in programs[:20]:
            print(f"  {p_link['text']}: {p_link['href']}")
        
        # Search for "submit" or "report" buttons/links
        buttons = await page.eval_on_selector_all('button, a', 
            'els => els.filter(e => /submit|report|vulnerability/i.test(e.textContent)).map(e => ({text: e.textContent.trim().slice(0,60), tag: e.tagName, href: e.href || ""}))')
        print(f"\nSubmit/report buttons: {len(buttons)}")
        for btn in buttons[:10]:
            print(f"  [{btn['tag']}] {btn['text']}: {btn['href']}")
        
        # Try to find a "Submit Vulnerability" or similar CTA
        cta_links = await page.eval_on_selector_all('a', 
            '''els => els.filter(e => {
                const t = e.textContent.toLowerCase();
                return t.includes('submit') || t.includes('report a') || t.includes('start') || t.includes('get started');
            }).map(e => ({text: e.textContent.trim().slice(0,60), href: e.href}))''')
        print(f"\nCTA links: {len(cta_links)}")
        for cta in cta_links[:10]:
            print(f"  {cta['text']}: {cta['href']}")
        
        # Take screenshot
        await page.screenshot(path="/tmp/immunefi_bounties.png", full_page=False)
        
        # Now try to find if there's a way to submit without being part of a program
        print("\n[2] Looking for general submission...")
        await page.goto("https://immunefi.com/", timeout=15000)
        
        # Check for any "Submit" link in the nav
        nav_links = await page.eval_on_selector_all('nav a, header a', 
            'els => els.map(e => ({text: e.textContent.trim().slice(0,40), href: e.href}))')
        print(f"Nav links: {len(nav_links)}")
        for link in nav_links:
            if any(kw in link['text'].lower() for kw in ['submit', 'report', 'program', 'bounty']):
                print(f"  {link['text']}: {link['href']}")
        
        await browser.close()

asyncio.run(main())

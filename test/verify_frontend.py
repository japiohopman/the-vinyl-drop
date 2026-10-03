from playwright.sync_api import Page, expect, sync_playwright
import time
import urllib.request
import subprocess

def verify_app():
    # Verify server is responding
    try:
        with urllib.request.urlopen("http://localhost:3000/health") as response:
            assert response.status == 200
    except Exception as e:
        print(f"Health check failed: {e}")
        return False

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            page.goto("http://localhost:3000/")
            expect(page.get_by_role("heading", name="Welcome to The Vinyl Drop")).to_be_visible()
            page.screenshot(path="/home/jules/verification/homepage.png")
            print("Visual verification screenshot generated at /home/jules/verification/homepage.png")
            return True
        finally:
            browser.close()

if __name__ == "__main__":
    success = verify_app()
    if not success:
        exit(1)

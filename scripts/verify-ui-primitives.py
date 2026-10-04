import time
import subprocess
import urllib.request
from playwright.sync_api import sync_playwright

def wait_for_server(url="http://localhost:3000/health", timeout=15):
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with urllib.request.urlopen(url) as response:
                if response.status == 200:
                    print(f"Server is ready at {url}")
                    return True
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError(f"Server did not start within {timeout} seconds")

def run_verification():
    print("Starting server process...")
    server_process = subprocess.Popen(["npx", "tsx", "src/server.ts"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    try:
        wait_for_server()

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                record_video_dir="verification/videos",
                viewport={"width": 1280, "height": 800}
            )
            page = context.new_page()

            # 1. Navigate to Home page
            print("Navigating to Home page...")
            page.goto("http://localhost:3000/")
            page.wait_for_timeout(1000)

            # 2. Click "View UI System" link
            print("Navigating to Design System showcase...")
            page.goto("http://localhost:3000/design-system")
            page.wait_for_timeout(1000)

            # 3. Test Form Interaction & Validation on Design System page
            print("Filling out listing demo form...")
            page.fill("#field-title", "A Love Supreme")
            page.wait_for_timeout(500)
            page.fill("#field-artist", "John Coltrane")
            page.wait_for_timeout(500)
            page.fill("#field-price", "35.00")
            page.wait_for_timeout(500)
            page.select_option("#field-mediaCondition", "NM")
            page.wait_for_timeout(500)
            page.fill("#field-description", "Original Impulse! pressing in excellent condition.")
            page.wait_for_timeout(500)
            page.fill("#field-acceptTerms", "on")
            page.wait_for_timeout(500)

            # 4. Submit form
            print("Submitting demo form...")
            page.get_by_role("button", name="Submit Demo Form").click()
            page.wait_for_timeout(1000)

            # 5. Capture desktop screenshot
            print("Capturing screenshot...")
            page.screenshot(path="verification/screenshots/verification.png", full_page=True)
            page.wait_for_timeout(1000)

            context.close()
            browser.close()
            print("Verification finished successfully.")
    finally:
        server_process.terminate()
        server_process.wait()

if __name__ == "__main__":
    run_verification()

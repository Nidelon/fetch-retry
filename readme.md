# Fetch Retry

**Version:** 2.0.0  
**Author:** Jxxy, Nidelon

## Overview
Fetch Retry is a high-performance SillyTavern extension designed to ensure chat continuity. It intercepts network requests to automatically handle API failures, rate limits, and content filter blocks.

## Key Features
*   **Smart Retries:** Automatically recovers from 429 (Rate Limit) and 5xx (Server Error) status codes.
*   **Filter Bypass:** Aggressively transforms requests when a "Prohibited Content" error is detected (configurable via `admin.js`).
*   **Response Validation:** Retries if the AI response is too short, empty, or cuts off abruptly.
*   **Thinking Timeout:** Prevents "infinite loading" by timing out and retrying stuck requests.
*   **Optimized Performance:** Cleaned-up monkey-patching logic with minimal overhead.

## Installation
1. Open **SillyTavern**.
2. Go to the **Extensions** menu (Extensions icon in the top bar).
3. Select **"Install Extension From URL"**.
4. Paste the repository link:
   ```
   https://github.com/Nidelon/fetch-retry
   ```
5. Restart SillyTavern.

## Settings
Access the **Fetch Retry** drawer in the extensions panel to configure:
*   **Max Retries:** Number of attempts before giving up.
*   **Base Delay:** Initial wait time between retries (uses exponential backoff for rate limits).
*   **Min Word Count:** Ensures the AI provides a substantial response.
*   **Aggressive Bypass:** Enable this to allow the extension to modify prompt words to bypass strict API filters.

## How it Works
The extension replaces the global `window.fetch` with a wrapper that monitors API responses. Unlike previous versions, this refactor uses response cloning to prevent "body already read" errors and properly manages `AbortController` signals for clean request cancellation.

## License
GPL-3.0 license

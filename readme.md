# Fetch Retry

Version: 1.1.0
Author: Jxxy

## Overview

Fetch Retry is a SillyTavern extension that automatically retries failed fetch requests.
This tool was made as a fun experiment together with AI, and many features might not work as intended.
The settings UI inside SillyTavern does not work, so if you want to change settings, you must edit them directly in the `index.js` file.

If you want to help improve or fix this extension, feel free to fork this repository and contribute.

## Features

* Automatically retries failed fetch requests
* Adjustable maximum retries
* Adjustable retry delay
* Special handling for HTTP 429 Too Many Requests
* Timeout for stuck "thinking" processes
* Detects short/incomplete responses and retries automatically

## Installation

1. Open SillyTavern
2. Go to the Extensions menu
3. Select "Install Extension From URL"
4. Paste the GitHub repository link:

   ```
   https://github.com/Hikarushmz/fetch-retry
   ```
5. Restart SillyTavern

## Settings

You can refer to the extension tab named "Fetch Retry" to modify settings as desired.

Please ensure not to enable 'Check for Empty/Short Responses' & 'Retry on Empty/Short Response', as this feature is not yet optimal and causes continuous response regeneration.

## How It Works

The extension monkey-patches the browser's native `fetch` function, adding retry logic for errors or incomplete responses.
It uses exponential backoff for delays and applies special handling for certain AI generation endpoints.

## License

MIT License


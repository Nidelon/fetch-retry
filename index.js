// == SillyTavern Extension: Fetch Retry ==
// Automatically retry all failed fetch requests with configurable retry count and delay.

import { t } from '../../../../scripts/i18n.js';
import { dragElement } from '../../../../scripts/RossAscends-mods.js';
import { loadMovingUIState } from '../../../../scripts/power-user.js';

const EXTENSION_NAME = 'Fetch Retry';
const settingsKey = 'FetchRetry';
const extensionName = "fetch-retry";
const extensionFolderPath = `data/default-user/extensions/${extensionName}`;

let fetchRetrySettings = {
    enabled: true,
    maxRetries: 5,
    retryDelay: 1000, // ms
    rateLimitDelay: 5000, // ms for 429 errors
    thinkingTimeout: 60000, // ms, timeout for reasoning process
    checkEmptyResponse: false,
    minWordCount: 10, // minimum words in response
    emptyResponseRetry: false, // retry if response too short
    shortResponseRetryDelay: 25000, // ms, specific delay for short/empty responses
    showErrorNotification: true, // show error notification after all retries fail
    streamInactivityTimeout: 30000, // ms, timeout for stream inactivity
    retryOnStopFinishReason: true, // NEW: Retry if AI stops with 'STOP' finish reason and response is too short
};

const customSettings = [
    {
        "type": "checkbox",
        "varId": "enabled",
        "displayText": t`Enable Fetch Retry`,
        "default": true,
        "description": t`Enable or disable the Fetch Retry extension.`
    },
    {
        "type": "slider",
        "varId": "maxRetries",
        "displayText": t`Maximum Retries`,
        "default": 5,
        "min": 0,
        "max": 10,
        "step": 1,
        "description": t`The maximum number of times to retry a failed fetch request.`
    },
    {
        "type": "slider",
        "varId": "retryDelay",
        "displayText": t`Retry Delay (ms)`,
        "default": 1000,
        "min": 100,
        "max": 60000,
        "step": 100,
        "description": t`The base delay in milliseconds before retrying a failed request. Uses exponential backoff.`
    },
    {
        "type": "slider",
        "varId": "rateLimitDelay",
        "displayText": t`Rate Limit Delay (ms)`,
        "default": 5000,
        "min": 1000,
        "max": 60000,
        "step": 1000,
        "description": t`Specific delay in milliseconds for 429 (Too Many Requests) errors.`
    },
    {
        "type": "slider",
        "varId": "thinkingTimeout",
        "displayText": t`AI Thinking Timeout (ms)`,
        "default": 60000,
        "min": 10000,
        "max": 300000,
        "step": 10000,
        "description": t`Timeout in milliseconds for the AI reasoning process. If exceeded, the request is retried.`
    },
    {
        "type": "checkbox",
        "varId": "checkEmptyResponse",
        "displayText": t`Check for Empty/Short Responses`,
        "default": false,
        "description": t`Enable to retry requests if the AI response is empty or too short. (this function may cause the AI to not respond)`
    },
    {
        "type": "slider",
        "varId": "minWordCount",
        "displayText": t`Minimum Word Count for Response`,
        "default": 10,
        "min": 1,
        "max": 100,
        "step": 1,
        "description": t`Minimum number of words expected in the AI response if 'Check for Empty/Short Responses' is enabled.`
    },
    {
        "type": "checkbox",
        "varId": "emptyResponseRetry",
        "displayText": t`Retry on Empty/Short Response`,
        "default": false,
        "description": t`If enabled, retries the request when the response is empty or too short. (this function may cause the AI to not respond)`
    },
    {
        "type": "slider",
        "varId": "shortResponseRetryDelay",
        "displayText": t`Short Response Retry Delay (ms)`,
        "default": 25000,
        "min": 5000,
        "max": 120000,
        "step": 1000,
        "description": t`Specific delay in milliseconds for retries due to short or empty responses.`
    },
    {
        "type": "checkbox",
        "varId": "showErrorNotification",
        "displayText": t`Show Error Notification`,
        "default": true,
        "description": t`Display a notification if all fetch retries fail.`
    },
    {
        "type": "slider",
        "varId": "streamInactivityTimeout",
        "displayText": t`Stream Inactivity Timeout (ms)`,
        "default": 30000,
        "min": 5000,
        "max": 120000,
        "step": 1000,
        "description": t`If a streaming response stops sending data for this duration, the request is retried.`
    },
    { // NEW SETTING
        "type": "checkbox",
        "varId": "retryOnStopFinishReason",
        "displayText": t`Retry on 'STOP' Finish Reason`,
        "default": true,
        "description": t`If enabled, retries the request when the AI response has 'STOP' as finish reason and is too short, indicating a potential content filter or incomplete response.`
    }
];

function loadSettings(settings) {
    if (settings) {
        customSettings.forEach(setting => {
            const { varId, type, default: defaultValue } = setting;
            if (settings[varId] !== undefined) {
                let loadedValue = settings[varId];
                switch (type) {
                    case 'checkbox':
                        fetchRetrySettings[varId] = Boolean(loadedValue);
                        break;
                    case 'slider':
                        fetchRetrySettings[varId] = Number(loadedValue);
                        break;
                    default:
                        fetchRetrySettings[varId] = loadedValue;
                }
            } else if (fetchRetrySettings[varId] === undefined) {
                // If setting is not in loaded settings, use default value
                fetchRetrySettings[varId] = defaultValue;
            }
        });
    }
}

function saveSettings() {
    // Return a copy of the current settings
    return { ...fetchRetrySettings };
}

/**
 * Generate default settings
 */
function generateDefaultSettings() {
    const settings = {
        enabled: true,
    };

    customSettings.forEach(setting => {
        settings[setting.varId] = setting.default;
    });

    return Object.freeze(settings);
}

const defaultSettings = generateDefaultSettings();

/**
 * Main extension initialization function
 * Executed when the extension loads, configures settings and initializes features
 */
(function initExtension() {
    const context = SillyTavern.getContext();

    if (!context.extensionSettings[settingsKey]) {
        context.extensionSettings[settingsKey] = structuredClone(defaultSettings);
    }

    // Ensure all default setting keys exist
    for (const key of Object.keys(defaultSettings)) {
        if (context.extensionSettings[settingsKey][key] === undefined) {
            context.extensionSettings[settingsKey][key] = defaultSettings[key];
        }
    }

    // Apply initial settings to fetchRetrySettings
    loadSettings(context.extensionSettings[settingsKey]);

    context.saveSettingsDebounced();

    // Automatically load or remove CSS based on enabled status
    toggleCss(context.extensionSettings[settingsKey].enabled);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExtensionUI);
    } else {
        initExtensionUI();
    }
})();

/**
 * Initialize UI elements and events for the extension
 */
function initExtensionUI() {
    renderExtensionSettings();
    addExtensionMenuButton();
}

/**
 * Adds a button to the Extensions dropdown menu for Fetch Retry UI
 */
function addExtensionMenuButton() {
    let $extensions_menu = $('#extensionsMenu');
    if (!$extensions_menu.length) {
        return;
    }

    let $button = $(`
    <div class="list-group-item flex-container flexGap5 interactable" title="${t`Open Fetch Retry Settings`}" data-i18n="[title]Open Fetch Retry Settings" tabindex="0">
        <i class="fa-solid fa-arrows-rotate"></i>
        <span>${t`Fetch Retry`}</span>
    </div>
    `);

    $button.appendTo($extensions_menu);

    $button.click(() => {
        toggle_popout();
    });
}

// Global popout variables
let POPOUT_VISIBLE = false;
let $popout = null;
let $drawer_content = null;

/**
 * Toggle the popout visibility
 */
function toggle_popout() {
    if (POPOUT_VISIBLE) {
        close_popout();
    } else {
        open_popout();
    }
}

/**
 * Open the settings popout
 */
function open_popout() {
    if (POPOUT_VISIBLE) return;

    const $drawer = $(`#${settingsKey}-drawer`);
    const $drawer_header = $drawer.find('.inline-drawer-header');
    const is_collapsed = !$drawer.find('.inline-drawer-content').hasClass('open');

    if (is_collapsed) {
        $drawer_header.click();
    }

    $drawer_content = $drawer.find('.inline-drawer-content');

    $popout = $(`
    <div id="fetch_retry_popout" class="draggable" style="display: none;">
        <div class="panelControlBar flex-container" id="fetchRetryPopoutHeader">
            <div class="fa-solid fa-arrows-rotate" style="margin-right: 10px;"></div>
            <div class="title">${t`Fetch Retry Settings`}</div>
            <div class="flex1"></div>
            <div class="fa-solid fa-grip drag-grabber hoverglow"></div>
            <div class="fa-solid fa-circle-xmark hoverglow dragClose"></div>
        </div>
        <div id="fetch_retry_content_container"></div>
    </div>
    `);

    $('body').append($popout);

    const $content_container = $popout.find('#fetch_retry_content_container');
    $drawer_content.removeClass('open').detach().appendTo($content_container);
    $drawer_content.addClass('open').show();

    try {
        loadMovingUIState();
        dragElement($popout);
    } catch (error) {
        console.error('[Fetch Retry] Error setting up dragging:', error);
    }

    $popout.find('.dragClose').on('click', close_popout);

    $popout.fadeIn(250);
    POPOUT_VISIBLE = true;

    $(document).on('keydown.fetch_retry_popout', function(e) {
        if (e.key === 'Escape') {
            close_popout();
        }
    });
}

/**
 * Close the settings popout
 */
function close_popout() {
    if (!POPOUT_VISIBLE || !$popout) return;

    $popout.fadeOut(250, function() {
        const $drawer = $(`#${settingsKey}-drawer`);
        const $content_container = $popout.find('#fetch_retry_content_container');

        $drawer_content.detach().appendTo($drawer);
        $drawer_content.addClass('open').show();

        $popout.remove();
        $popout = null;
    });

    POPOUT_VISIBLE = false;

    $(document).off('keydown.fetch_retry_popout');
}

/**
 * Automatically load or remove CSS based on enabled status in settings
 * @param {boolean} shouldLoad - If true, load CSS, otherwise remove
 */
function toggleCss(shouldLoad) {
    const existingLink = document.getElementById('FetchRetry-style');

    if (shouldLoad) {
        const baseUrl = getBaseUrl();
        if (!existingLink) {
            const cssUrl = `${baseUrl}/style.css`;
            const link = document.createElement('link');
            link.id = 'FetchRetry-style';
            link.rel = 'stylesheet';
            link.href = cssUrl;
            document.head.append(link);
        }
    } else {
        if (existingLink) existingLink.remove();
    }
}

/**
 * Get the base URL path for the extension
 * @returns {string} Base URL for the extension
 */
function getBaseUrl() {
    let baseUrl = '';
    if (typeof import.meta !== 'undefined' && import.meta.url) {
        baseUrl = new URL('.', import.meta.url).href;
    } else {
        const currentScript = /** @type {HTMLScriptElement} */ (document.currentScript);
        if (currentScript && currentScript.src) {
            baseUrl = currentScript.src.substring(0, currentScript.src.lastIndexOf('/'));
        } else {
            baseUrl = `${window.location.origin}data/default-user/extensions/${extensionName}`;
        }
    }
    return baseUrl;
}

/**
 * Render extension settings panel
 */
function renderExtensionSettings() {
    const context = SillyTavern.getContext();
    const settingsContainer = document.getElementById(`${settingsKey}-container`) ?? document.getElementById('extensions_settings2');
    if (!settingsContainer) {
        return;
    }

    let existingDrawer = settingsContainer.querySelector(`#${settingsKey}-drawer`);
    if (existingDrawer) {
        return;
    }

    const inlineDrawer = document.createElement('div');
    inlineDrawer.id = `${settingsKey}-drawer`;
    inlineDrawer.classList.add('inline-drawer');
    settingsContainer.append(inlineDrawer);

    const inlineDrawerToggle = document.createElement('div');
    inlineDrawerToggle.classList.add('inline-drawer-toggle', 'inline-drawer-header');

    const extensionNameElement = document.createElement('b');
    extensionNameElement.textContent = EXTENSION_NAME;

    const inlineDrawerIcon = document.createElement('div');
    inlineDrawerIcon.classList.add('inline-drawer-icon', 'fa-solid', 'fa-circle-chevron-down', 'down');

    inlineDrawerToggle.append(extensionNameElement, inlineDrawerIcon);

    const inlineDrawerContent = document.createElement('div');
    inlineDrawerContent.classList.add('inline-drawer-content');

    inlineDrawer.append(inlineDrawerToggle, inlineDrawerContent);

    const settings = context.extensionSettings[settingsKey];

    // Create settings UI elements
    customSettings.forEach(setting => {
        const settingContainer = document.createElement('div');
        settingContainer.classList.add('fetch-retry-setting-item');
        createSettingItem(settingContainer, setting, settings);
        inlineDrawerContent.appendChild(settingContainer);
    });

    inlineDrawerToggle.addEventListener('click', function() {
        this.classList.toggle('open');
        inlineDrawerIcon.classList.toggle('down');
        inlineDrawerIcon.classList.toggle('up');
        inlineDrawerContent.classList.toggle('open');
    });

    // Apply initial settings to UI
    applyAllSettings();
}

/**
 * Create single setting item
 */
function createSettingItem(container, setting, settings) {
    const context = SillyTavern.getContext();
    const { varId, displayText, description, type, default: defaultValue } = setting;

    const settingWrapper = document.createElement('div');
    settingWrapper.classList.add('fetch-retry-setting-wrapper');

    const settingRow = document.createElement('div');
    settingRow.classList.add('setting-row');

    const label = document.createElement('label');
    label.htmlFor = `fetch-retry-${varId}`;
    label.textContent = displayText;
    settingRow.appendChild(label);
    settingWrapper.appendChild(settingRow);

    if (description) {
        const descElement = document.createElement('small');
        descElement.textContent = description;
        settingWrapper.appendChild(descElement);
    }

    let inputElement;
    switch (type) {
        case 'checkbox':
            inputElement = /** @type {HTMLInputElement} */ (document.createElement('input'));
            inputElement.id = `fetch-retry-${varId}`;
            inputElement.type = 'checkbox';
            inputElement.checked = Boolean(settings[varId] ?? defaultValue); // Explicitly cast to boolean
            inputElement.addEventListener('change', () => {
                settings[varId] = inputElement.checked;
                context.saveSettingsDebounced();
                if (varId === 'enabled') {
                    toggleCss(inputElement.checked);
                }
                /** @type {any} */ (toastr).info(t`Please refresh the web page to apply changes.`, 'Settings Saved');
            });
            settingRow.appendChild(inputElement);
            break;
        case 'slider':
            inputElement = /** @type {HTMLInputElement} */ (document.createElement('input'));
            inputElement.id = `fetch-retry-${varId}`;
            inputElement.type = 'range';
            inputElement.min = String(setting.min);
            inputElement.max = String(setting.max);
            inputElement.step = String(setting.step);
            inputElement.value = String(settings[varId] ?? defaultValue);
            inputElement.addEventListener('input', () => {
                settings[varId] = Number(inputElement.value);
                context.saveSettingsDebounced();
                // Update associated number input if exists
                const numberInput = /** @type {HTMLInputElement} */ (document.getElementById(`fetch-retry-${varId}-number`));
                if (numberInput) {
                    numberInput.value = inputElement.value;
                }
            });

            const numberInput = /** @type {HTMLInputElement} */ (document.createElement('input'));
            numberInput.id = `fetch-retry-${varId}-number`;
            numberInput.type = 'number';
            numberInput.min = String(setting.min);
            numberInput.max = String(setting.max);
            numberInput.step = String(setting.step);
            numberInput.value = String(settings[varId] ?? defaultValue);
            numberInput.style.marginLeft = '10px';
            numberInput.addEventListener('change', () => {
                settings[varId] = Number(numberInput.value);
                context.saveSettingsDebounced();
                // Update associated slider if exists
                inputElement.value = numberInput.value;
                /** @type {any} */ (toastr).info(t`Please refresh the web page to apply changes.`, 'Settings Saved');
            });

            const sliderContainer = document.createElement('div');
            sliderContainer.classList.add('slider-container');
            sliderContainer.appendChild(inputElement);
            sliderContainer.appendChild(numberInput);
            settingWrapper.appendChild(sliderContainer);
            break;
    }

    container.appendChild(settingWrapper);
}

/**
 * Apply all settings to the UI and update fetchRetrySettings
 */
function applyAllSettings() {
    const context = SillyTavern.getContext();
    const settings = context.extensionSettings[settingsKey];

    customSettings.forEach(setting => {
        const { varId, type } = setting;

        // Update the internal fetchRetrySettings object
        fetchRetrySettings[varId] = settings[varId];

        const element = document.getElementById(`fetch-retry-${varId}`);
        if (element) {
            if (type === 'checkbox') {
                /** @type {HTMLInputElement} */ (element).checked = Boolean(settings[varId]);
            } else if (type === 'slider') {
                /** @type {HTMLInputElement} */ (element).value = String(settings[varId]);
                const numberInput = /** @type {HTMLInputElement} */ (document.getElementById(`fetch-retry-${varId}-number`));
                if (numberInput) {
                    numberInput.value = String(settings[varId]);
                }
            }
        }
    });
}

// Show error notification function
function showErrorNotification(error, response) {
    if (!fetchRetrySettings.showErrorNotification) return;
    
    let message = 'Fetch failed after all retries';
    let type = 'error';
    
    if (response) {
        if (response.status === 429) {
            message = `Rate limited (429): Too many requests`;
        } else if (response.status >= 500) {
            message = `Server error (${response.status}): ${response.statusText}`;
        } else if (response.status === 403) {
            message = `Forbidden (403): Access denied`;
        } else {
            message = `HTTP ${response.status}: ${response.statusText}`;
        }
        } else if (error) {
            if (error.name === 'TimeoutError') {
                message = `Timeout: AI thinking process exceeded limit`;
                type = 'error';
            } else if (error.name === 'AbortError') {
                message = `Request aborted`;
                type = 'error';
            } else {
                message = `Network error: ${error.message}`;
            }
    }
    
    // Use SillyTavern's toast notification if available
    if (typeof toastr !== 'undefined') {
        /** @type {any} */ (toastr)[type](message, 'Fetch Retry');
    } else {
        // Fallback notification
        console.error(`[Fetch Retry] ${message}`);
        alert(`Fetch Retry Error: ${message}`);
    }
}

let streamTimeoutId = null; // Declare at a higher scope

async function isResponseInvalid(response, url = '') {
    if (!fetchRetrySettings.checkEmptyResponse && !fetchRetrySettings.streamInactivityTimeout) {
        return { invalid: false, reason: '' };
    }

    // Only check generation endpoints for short responses to avoid false positives
    const generationEndpoints = ['/completion', '/generate', '/chat/completions', '/run/predict'];
    const isGenerationUrl = generationEndpoints.some(endpoint => url.includes(endpoint));

    if (!isGenerationUrl) {
        return { invalid: false, reason: '' };
    }
    
    try {
        // Clone response so it can be read again later
        const clonedResponse = response.clone();
        const contentType = response.headers.get('content-type') || '';
        let textToCheck = '';

        if (contentType.includes('application/json')) {
            const data = await clonedResponse.json();
            // Extract text from various possible JSON structures
            if (data.choices && data.choices[0]) {
                textToCheck = data.choices[0].message?.content || data.choices[0].text || '';
            } else if (data.response) {
                textToCheck = data.response;
            } else if (data.text) {
                textToCheck = data.text;
            } else if (data.message) {
                textToCheck = data.message;
            } else if (typeof data === 'string') {
                textToCheck = data;
            }

            // NEW: Check for 'STOP' finish reason in JSON responses
            if (fetchRetrySettings.retryOnStopFinishReason && data.choices && data.choices[0] && data.choices[0].finish_reason === 'stop') {
                const wordCount = textToCheck.trim().split(/\s+/).filter(Boolean).length;
                if (wordCount < fetchRetrySettings.minWordCount) {
                    console.warn(`[Fetch Retry] AI stopped with 'STOP' finish reason and response is too short (${wordCount} words, min: ${fetchRetrySettings.minWordCount}). Retrying...`);
                    return { invalid: true, reason: 'stop_and_short' };
                }
            }
        } else if (contentType.includes('text/')) {
            textToCheck = await clonedResponse.text();
        }

        // Perform checks only if we have text
        if (textToCheck) {
            const trimmedText = textToCheck.trim();

            // 1. Check for short response
            if (fetchRetrySettings.checkEmptyResponse) {
                const wordCount = trimmedText.split(/\s+/).filter(Boolean).length;
                if (wordCount < fetchRetrySettings.minWordCount) {
                    console.warn(`[Fetch Retry] Response too short: ${wordCount} words (min: ${fetchRetrySettings.minWordCount})`);
                    return { invalid: true, reason: 'too_short' };
                }
            }

        } else if (fetchRetrySettings.checkEmptyResponse) {
            // Handle completely empty responses
            console.warn('[Fetch Retry] Response is empty.');
            return { invalid: true, reason: 'too_short' };
        }

    } catch (err) {
        console.warn('[Fetch Retry] Error checking response validity:', err);
        if (err.message === 'Stream inactivity timeout') {
            console.warn('[Fetch Retry] Stream stopped mid-way due to inactivity.');
            return { invalid: true, reason: 'stream_inactivity' };
        }
    }
    
    return { invalid: false, reason: '' };
}

// Helper function to determine delay based on error
function getRetryDelay(error, response, attempt, isShortResponse = false) {
    // If there's a Retry-After header, use that
    if (response && response.headers.has('Retry-After')) {
        const retryAfter = response.headers.get('Retry-After');
        const seconds = parseInt(retryAfter);
        if (!isNaN(seconds)) {
            return Math.min(seconds * 1000, 30000); // Max 30 seconds
        }
    }
    
    // For 429 errors, use longer delay
    if (response && response.status === 429) {
        return fetchRetrySettings.rateLimitDelay * Math.pow(1.5, attempt); // Exponential backoff
    }
    
    // For responses that are too short, use the specific longer delay
    if (isShortResponse) {
        return fetchRetrySettings.shortResponseRetryDelay;
    }
    
    // Default delay with exponential backoff
    return fetchRetrySettings.retryDelay * Math.pow(1.2, attempt);
}

// Monkey-patch fetch
if (!(/** @type {any} */ (window))._fetchRetryPatched) {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        if (!fetchRetrySettings.enabled) {
            return originalFetch.apply(this, args);
        }

        let attempt = 0;
        let lastError;
        let lastResponse;
        const fetchArgs = [...args]; // Use a consistent args object for retries
        
        while (attempt <= fetchRetrySettings.maxRetries) {
            const controller = new AbortController();
            const signal = controller.signal;
            let timeoutId;
            let currentFetchArgs = [...fetchArgs]; // Use a copy for this specific attempt

            // Add signal to the arguments for this attempt.
            if (currentFetchArgs[0] instanceof Request) {
                // Cannot modify Request object directly, need to create new one
                const newRequest = new Request(currentFetchArgs[0], { signal });
                currentFetchArgs[0] = newRequest;
            } else {
                currentFetchArgs[1] = Object.assign({}, currentFetchArgs[1], { signal });
            }

            try {
                const fetchPromise = originalFetch.apply(this, currentFetchArgs);

                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        const error = new Error('Thinking timeout reached');
                        error.name = 'TimeoutError';
                        controller.abort();
                        reject(error);
                    }, fetchRetrySettings.thinkingTimeout);
                });

                const result = await Promise.race([fetchPromise, timeoutPromise]);
                clearTimeout(timeoutId); // Clear timeout if fetch succeeds

                lastResponse = result;
                
                // Success if status 200-299
                if (result.ok) {
                    let processedResult = result;
                    
                    // Check if response is invalid (too short or incomplete)
                    const url = args[0] instanceof Request ? args[0].url : String(args[0]);
                    const { invalid, reason } = await isResponseInvalid(processedResult, url);

                    if (invalid && attempt < fetchRetrySettings.maxRetries) {
                        console.warn(`[Fetch Retry] Response is invalid (${reason}), retrying... attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                        const isShort = reason === 'too_short' || reason === 'stream_inactivity';
                        const delay = getRetryDelay(null, processedResult, attempt, isShort);
                        console.log(`[Fetch Retry] Waiting ${delay}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        attempt++;
                        continue;
                    }
                    return processedResult;
                }
                
                // Handle specific error codes
                if (result.status === 429) {
                    console.warn(`[Fetch Retry] Rate limited (429), attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                } else if (result.status >= 500) {
                    console.warn(`[Fetch Retry] Server error (${result.status}), attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                } else if (result.status >= 400) {
                    // Client errors other than 429 usually don't need retry
                    throw new Error(`HTTP ${result.status}: ${result.statusText}`);
                }
                
                throw new Error(`HTTP ${result.status}: ${result.statusText}`);
                
            } catch (err) {
                clearTimeout(timeoutId); // Make sure timeout is cleared if there's another error
                lastError = err;

                if (err.name === 'TimeoutError') {
                    console.warn(`[Fetch Retry] AI thinking timeout (${fetchRetrySettings.thinkingTimeout}ms), retrying... attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                } else if (err.name === 'AbortError') {
                    // Treat AbortError as a retryable error, especially if it's not a user-initiated abort.
                    // The TimeoutError already triggers an abort, so this catches other aborts.
                    console.warn(`[Fetch Retry] Request aborted (${err.message}), retrying... attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                } else {
                    console.warn(`[Fetch Retry] Error: ${err.message}, attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                }
                
                // If max retries reached, break
                if (attempt >= fetchRetrySettings.maxRetries) {
                    break;
                }
                
                // Determine delay for retry
                const delay = getRetryDelay(err, lastResponse, attempt);
                console.log(`[Fetch Retry] Waiting ${delay}ms before retry...`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
                attempt++;
            }
        }
        
        // If we get here, all attempts failed
        console.error(`[Fetch Retry] All ${fetchRetrySettings.maxRetries + 1} attempts failed`);
        
        // Show error notification
        showErrorNotification(lastError, lastResponse);
        
        throw lastError;
    };
    
    (/** @type {any} */ (window))._fetchRetryPatched = true;
    console.log('[Fetch Retry] Extension loaded and fetch patched');
}

export default {
    id: 'fetch-retry',
    name: 'Fetch Retry',
    description: 'Automatically retry all failed fetch requests with special handling for 429, short responses, and stream inactivity.',
    settings: fetchRetrySettings,
    loadSettings,
    saveSettings,
};

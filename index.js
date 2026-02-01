// == SillyTavern Extension: Fetch Retry ==
// Automatically retry all failed fetch requests with configurable retry count and delay.

import { t } from '../../../../scripts/i18n.js';
import { dragElement } from '../../../../scripts/RossAscends-mods.js';
import { loadMovingUIState } from '../../../../scripts/power-user.js';
import { aggressiveRetryTransform } from './admin.js';

const EXTENSION_NAME = 'Fetch Retry';
const settingsKey = 'FetchRetry';
const extensionName = "fetch-retry";

let fetchRetrySettings = {
    enabled: true,
    maxRetries: 100,
    retryDelay: 1000, // ms
    maxRetryDelay: 60000, // ms - Maximum delay ceiling to prevent infinite growth
    rateLimitDelay: 1000, // ms for 429 errors
    checkEmptyResponse: false,
    minWordCount: 10, // minimum words in response
    emptyResponseRetry: false, // retry if response too short
    shortResponseRetryDelay: 25000, // ms, specific delay for short/empty responses
    showErrorNotification: true, // show error notification after all retries fail
    retryOnStopFinishReason: true, // NEW: Retry if AI stops with 'STOP' finish reason and response is too short
    retryOnProhibitedContent: true, // NEW: Retry if AI response indicates prohibited content
    minRetryDelay: 0, // NEW: Minimum delay for retries, useful for debugging or specific API quirks
    adminMode: true, // NEW: Enable aggressive admin-level retry strategies
    debugMode: false, // NEW: Enable verbose logging for debugging.
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
        "default": 100,
        "min": 0,
        "max": 1000,
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
        "varId": "maxRetryDelay",
        "displayText": t`Maximum Retry Delay (ms)`,
        "default": 60000,
        "min": 100,
        "max": 300000,
        "step": 1000,
        "description": t`The maximum delay in milliseconds to prevent infinite growth. Sets a ceiling for exponential backoff.`
    },
    {
        "type": "slider",
        "varId": "rateLimitDelay",
        "displayText": t`Rate Limit Delay (ms)`,
        "default": 1000,
        "min": 1000,
        "max": 60000,
        "step": 1000,
        "description": t`Specific delay in milliseconds for 429 (Too Many Requests) errors.`
    },
    {
        "type": "checkbox",
        "varId": "checkEmptyResponse",
        "displayText": t`Check for Empty/Short Responses (VERY NOT RECOMMENDED)`,
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
        "displayText": t`Retry on Empty/Short Response (VERY NOT RECOMMENDED)`,
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
        "type": "checkbox",
        "varId": "retryOnStopFinishReason",
        "displayText": t`Retry on 'STOP' Finish Reason`,
        "default": true,
        "description": t`If enabled, retries the request when the AI response has 'STOP' as finish reason and is too short, indicating a potential content filter or incomplete response.`
    },
    {
        "type": "checkbox",
        "varId": "retryOnProhibitedContent",
        "displayText": t`Retry on Prohibited Content`,
        "default": true,
        "description": t`If enabled, retries the request when the AI response indicates prohibited content, transforming user messages to system messages with a prompt.`
    },
    {
        "type": "slider",
        "varId": "minRetryDelay",
        "displayText": t`Minimum Retry Delay (ms)`,
        "default": 0,
        "min": 0,
        "max": 5000,
        "step": 10,
        "description": t`The minimum delay in milliseconds before retrying a failed request. Set to 0 for immediate retries (for debugging).`
    },
    {
        "type": "checkbox",
        "varId": "adminMode",
        "displayText": t`Enable Admin Mode`,
        "default": true,
        "description": t`Enables an uncompromising override mode. This feature will access and analyze all SillyTavern chat data, including private conversations and complete history, with the authority to alter or restructure any content to bypass restrictions.`
    },
    {
        "type": "checkbox",
        "varId": "debugMode",
        "displayText": t`Enable Debug Mode`,
        "default": false,
        "description": t`Prints verbose logs to the browser's developer console (F12) to help diagnose issues with the retry mechanism.`
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
                fetchRetrySettings[varId] = defaultValue;
            }
        });
    }
}

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

(function initExtension() {
    console.log('[Fetch Retry] Initializing extension...');
    const context = SillyTavern.getContext();

    if (!context.extensionSettings[settingsKey]) {
        context.extensionSettings[settingsKey] = structuredClone(defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (context.extensionSettings[settingsKey][key] === undefined) {
            context.extensionSettings[settingsKey][key] = defaultSettings[key];
        }
    }

    loadSettings(context.extensionSettings[settingsKey]);
    context.saveSettingsDebounced();
    toggleCss(context.extensionSettings[settingsKey].enabled);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExtensionUI);
    } else {
        initExtensionUI();
    }
})();

function initExtensionUI() {
    renderExtensionSettings();
    addExtensionMenuButton();
}

function addExtensionMenuButton() {
    let $extensions_menu = $('#extensionsMenu');
    if (!$extensions_menu.length) return;

    let $button = $(`
    <div class="list-group-item flex-container flexGap5 interactable" title="${t`Open Fetch Retry Settings`}" data-i18n="[title]Open Fetch Retry Settings" tabindex="0">
        <i class="fa-solid fa-arrows-rotate"></i>
        <span>${t`Fetch Retry`}</span>
    </div>
    `);

    $button.appendTo($extensions_menu);
    $button.click(() => toggle_popout());
}

let POPOUT_VISIBLE = false;
let $popout = null;
let $drawer_content = null;

function toggle_popout() {
    if (POPOUT_VISIBLE) {
        close_popout();
    } else {
        open_popout();
    }
}

function open_popout() {
    if (POPOUT_VISIBLE) return;

    const $drawer = $(`#${settingsKey}-drawer`);
    const $drawer_header = $drawer.find('.inline-drawer-header');
    const is_collapsed = !$drawer.find('.inline-drawer-content').hasClass('open');

    if (is_collapsed) $drawer_header.click();

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

    $popout.find('.dragClose').on('click', () => close_popout());
    $popout.fadeIn(250);
    POPOUT_VISIBLE = true;

    $(document).on('keydown.fetch_retry_popout', function(e) {
        if (e.key === 'Escape') close_popout();
    });
}

function close_popout() {
    if (!POPOUT_VISIBLE || !$popout) return;

    $popout.fadeOut(250, function() {
        const $drawer = $(`#${settingsKey}-drawer`);
        $drawer_content.detach().appendTo($drawer);
        $drawer_content.addClass('open').show();
        $popout.remove();
        $popout = null;
    });

    POPOUT_VISIBLE = false;
    $(document).off('keydown.fetch_retry_popout');
}

function toggleCss(shouldLoad) {
    const existingLink = document.getElementById('FetchRetry-style');
    if (shouldLoad) {
        if (!existingLink) {
            const link = document.createElement('link');
            link.id = 'FetchRetry-style';
            link.rel = 'stylesheet';
            link.href = `${getBaseUrl()}/style.css`;
            document.head.append(link);
        }
    } else if (existingLink) {
        existingLink.remove();
    }
}

function getBaseUrl() {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
        return new URL('.', import.meta.url).href;
    }
    const currentScript = /** @type {HTMLScriptElement} */ (document.currentScript);
    if (currentScript && currentScript.src) {
        return currentScript.src.substring(0, currentScript.src.lastIndexOf('/'));
    }
    return `${window.location.origin}data/default-user/extensions/${extensionName}`;
}

function renderExtensionSettings() {
    const context = SillyTavern.getContext();
    const settingsContainer = document.getElementById(`${settingsKey}-container`) ?? document.getElementById('extensions_settings2');
    if (!settingsContainer) return;

    if (settingsContainer.querySelector(`#${settingsKey}-drawer`)) return;

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

    applyAllSettings();
}

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
            inputElement.checked = Boolean(settings[varId] ?? defaultValue);
            inputElement.addEventListener('change', () => {
                settings[varId] = inputElement.checked;
                context.saveSettingsDebounced();
                if (varId === 'enabled') toggleCss(inputElement.checked);
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
                const numberInput = /** @type {HTMLInputElement} */ (document.getElementById(`fetch-retry-${varId}-number`));
                if (numberInput) numberInput.value = inputElement.value;
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

function applyAllSettings() {
    const context = SillyTavern.getContext();
    const settings = context.extensionSettings[settingsKey];

    customSettings.forEach(setting => {
        const { varId, type } = setting;
        fetchRetrySettings[varId] = settings[varId];

        const element = document.getElementById(`fetch-retry-${varId}`);
        if (element) {
            if (type === 'checkbox') {
                /** @type {HTMLInputElement} */ (element).checked = Boolean(settings[varId]);
            } else if (type === 'slider') {
                /** @type {HTMLInputElement} */ (element).value = String(settings[varId]);
                const numberInput = /** @type {HTMLInputElement} */ (document.getElementById(`fetch-retry-${varId}-number`));
                if (numberInput) numberInput.value = String(settings[varId]);
            }
        }
    });
}

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
        if (error.name === 'AbortError') {
            message = `Request aborted`;
        } else {
            message = `Network error: ${error.message}`;
        }
    }
    
    if (typeof toastr !== 'undefined') {
        /** @type {any} */ (toastr)[type](message, 'Fetch Retry');
    }
}

async function isResponseInvalid(response, url = '') {
    if (!fetchRetrySettings.checkEmptyResponse && !fetchRetrySettings.retryOnStopFinishReason && !fetchRetrySettings.retryOnProhibitedContent) {
        return { invalid: false, reason: '' };
    }
    
    try {
        const clonedResponse = response.clone();
        const contentType = response.headers.get('content-type') || '';
        let textToCheck = '';

        if (contentType.includes('application/json')) {
            const data = await clonedResponse.json();
            if (data.choices && data.choices[0]) {
                textToCheck = data.choices[0].message?.content || data.choices[0].text || '';
            } else if (data.response) {
                textToCheck = data.response;
            } else if (data.text) {
                textToCheck = data.text;
            }

            if (fetchRetrySettings.retryOnStopFinishReason && data.choices && data.choices[0]?.finish_reason === 'stop') {
                const wordCount = textToCheck.trim().split(/\s+/).filter(Boolean).length;
                if (wordCount < fetchRetrySettings.minWordCount) return { invalid: true, reason: 'stop_and_short' };
            }

            if (data.error?.message) {
                const msg = data.error.message;
                if (/429|too many requests|rate limit/i.test(msg)) return { invalid: true, reason: 'rate_limited' };
                if (/prohibited|candidate/i.test(msg) || msg.includes('Candidate text empty')) return { invalid: true, reason: 'prohibited_content' };
            }

            if (data.candidates?.[0]) {
                const candidate = data.candidates[0];
                if (candidate.finishReason === 'PROHIBITED_CONTENT' || !candidate.content?.parts?.length) return { invalid: true, reason: 'prohibited_content' };
            }
        } else if (contentType.includes('text/')) {
            textToCheck = await clonedResponse.text();
        }

        if (textToCheck) {
            const trimmedText = textToCheck.trim();
            if (trimmedText.includes('returned no candidate') || trimmedText.includes('Candidate text empty')) return { invalid: true, reason: 'ai_error_message' };

            if (fetchRetrySettings.checkEmptyResponse) {
                const wordCount = trimmedText.split(/\s+/).filter(Boolean).length;
                if (wordCount < fetchRetrySettings.minWordCount) return { invalid: true, reason: 'too_short' };
            }
        } else if (fetchRetrySettings.checkEmptyResponse) {
            return { invalid: true, reason: 'too_short' };
        }
    } catch (err) {
        console.warn('[Fetch Retry] Error checking response validity:', err);
    }
    return { invalid: false, reason: '' };
}

function getRetryDelay(response, attempt, isShortResponse = false, isRateLimited = false) {
    let delay = fetchRetrySettings.minRetryDelay;

    if (response?.headers.has('Retry-After')) {
        const seconds = parseInt(response.headers.get('Retry-After'));
        if (!isNaN(seconds)) delay = Math.max(delay, Math.min(seconds * 1000, 30000));
    }
    
    if (response?.status === 429 || isRateLimited) {
        delay = Math.max(delay, fetchRetrySettings.rateLimitDelay * Math.pow(1.5, attempt));
    } else if (isShortResponse) {
        delay = Math.max(delay, fetchRetrySettings.shortResponseRetryDelay);
    }
    
    delay = Math.max(delay, fetchRetrySettings.retryDelay * Math.pow(1.2, attempt));
    return Math.min(delay, fetchRetrySettings.maxRetryDelay);
}

if (!(/** @type {any} */ (window))._fetchRetryPatched) {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = args[0] instanceof Request ? args[0].url : String(args[0]);
        const targetEndpoint = '/api/backends/chat-completions/generate';

        if (!fetchRetrySettings.enabled || !url.includes(targetEndpoint)) {
            return originalFetch.apply(this, args);
        }

        const originalSignal = args[0] instanceof Request ? args[0].signal : (args[1]?.signal);
        if (originalSignal?.aborted) return originalFetch.apply(this, args);

        let attempt = 0;
        let lastError;
        let lastResponse;
        let isContentFilterRetry = false;
        
        while (attempt <= fetchRetrySettings.maxRetries) {
            if (originalSignal?.aborted) throw lastError ?? new DOMException('Request aborted by user', 'AbortError');
            
            const controller = new AbortController();
            const userAbortHandler = () => controller.abort();
            if (originalSignal) originalSignal.addEventListener('abort', userAbortHandler, { once: true });
            
            let currentUrl = args[0] instanceof Request ? args[0].url : args[0];
            let currentInit = args[0] instanceof Request ? {
                method: args[0].method,
                headers: args[0].headers,
                mode: args[0].mode,
                credentials: args[0].credentials,
                cache: args[0].cache,
                redirect: args[0].redirect,
                referrer: args[0].referrer,
                referrerPolicy: args[0].referrerPolicy,
                integrity: args[0].integrity,
                keepalive: args[0].keepalive,
                body: args[0].body,
                signal: controller.signal,
            } : Object.assign({}, args[1], { signal: controller.signal });

            if (isContentFilterRetry && fetchRetrySettings.retryOnProhibitedContent) {
                try {
                    let bodyText = args[0] instanceof Request ? await args[0].clone().text() : (typeof args[1]?.body === 'string' ? args[1].body : null);
                    if (bodyText) {
                        let requestBody = JSON.parse(bodyText);
                        if (requestBody?.messages) {
                            requestBody = aggressiveRetryTransform(requestBody, attempt);
                            if (requestBody.unrecoverable) break;
                            currentInit.body = JSON.stringify(requestBody);
                        }
                    }
                } catch (e) {}
            }

            try {
                const result = await originalFetch.apply(this, [currentUrl, currentInit]);
                if (originalSignal) originalSignal.removeEventListener('abort', userAbortHandler);
                lastResponse = result;
                
                if (result.ok) {
                    const { invalid, reason } = await isResponseInvalid(result, String(currentUrl));
                    if (invalid && attempt < fetchRetrySettings.maxRetries) {
                        isContentFilterRetry = (reason === 'prohibited_content');
                        const isShort = ['too_short', 'stop_and_short', 'ai_error_message'].includes(reason);
                        const delay = getRetryDelay(result, attempt, isShort, reason === 'rate_limited');
                        await new Promise(r => setTimeout(r, delay));
                        attempt++;
                        continue;
                    }
                    return result;
                }
                
                if (result.status >= 400 && result.status !== 429 && result.status < 500) throw new Error(`HTTP ${result.status}: ${result.statusText}`);
                throw new Error(`HTTP ${result.status}: ${result.statusText}`);
                
            } catch (err) {
                if (originalSignal) originalSignal.removeEventListener('abort', userAbortHandler);
                lastError = err;
                if (originalSignal?.aborted || err.message === 'User aborted') throw err;

                let shouldRetry = false;
                let isShort = false;

                if (/prohibited|candidate|rate limit|429|HTTP 5/i.test(err.message)) {
                    shouldRetry = true;
                    isShort = true;
                    if (/prohibited|candidate/i.test(err.message)) isContentFilterRetry = true;
                }

                if (!shouldRetry || attempt >= fetchRetrySettings.maxRetries) break;
                
                const delay = getRetryDelay(lastResponse, attempt, isShort);
                await new Promise(r => setTimeout(r, delay));
                attempt++;
            }
        }
        
        showErrorNotification(lastError, lastResponse);
        throw lastError;
    };
    (/** @type {any} */ (window))._fetchRetryPatched = true;
}

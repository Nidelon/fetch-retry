import { t } from '../../../../scripts/i18n.js';
import { aggressiveRetryTransform } from './admin.js';

const settingsKey = 'FetchRetry';
const defaultSettings = {
    enabled: true,
    maxRetries: 1000,
    retryDelay: 1000,
    maxRetryDelay: 5000,
    rateLimitDelay: 2000,
    thinkingTimeout: 120000,
    checkEmptyResponse: false,
    minWordCount: 10,
    streamInactivityTimeout: 30000,
    retryOnStopFinishReason: true,
    retryOnProhibitedContent: true,
    debugMode: false,
};

let settings = {};

function isStreamingRequest(config) {
    try {
        if (!config.body) return false;
        const body = JSON.parse(config.body);
        return body.stream === true;
    } catch (e) {
        return false;
    }
}

async function validateResponse(response, url) {
    const isGen = ['/completion', '/generate', '/chat/completions'].some(e => url.includes(e));
    if (!isGen || isStreamingRequest(config)) return { ok: true };

    try {
        const clone = response.clone();
        const data = await clone.json();

        if (settings.retryOnProhibitedContent) {
            const hasError = data.error?.message?.match(/prohibited|safety|content filter/i);
            const isEmptyCandidate = data.candidates?.[0]?.finishReason === 'PROHIBITED_CONTENT';
            if (hasError || isEmptyCandidate) return { ok: false, reason: 'prohibited' };
        }

        if (settings.checkEmptyResponse) {
            const text = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || data.response || "";
			if (!text || text.trim().length === 0) return { ok: false, reason: 'empty_text' };

            const words = text.trim().split(/\s+/).filter(Boolean).length;
            if (words < settings.minWordCount) return { ok: false, reason: 'too_short' };
        }

        if (settings.retryOnStopFinishReason && data.choices?.[0]?.finish_reason === 'stop') {
             const text = data.choices?.[0]?.message?.content || "";
             if (text.length < 20) return { ok: false, reason: 'abrupt_stop' };
        }

    } catch (e) {
        if (settings.debugMode) console.error('[Fetch Retry] Validation failed (non-JSON?)', e);
    }
    return { ok: true };
}

const originalFetch = window.fetch;
window.fetch = async function (...args) {
    if (!settings.enabled) return originalFetch.apply(this, args);

    let [resource, config] = args;
    const url = resource instanceof Request ? resource.url : resource;
    
    let lastError;
    let attempt = 0;

    while (attempt <= settings.maxRetries) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), settings.thinkingTimeout);

        const currentConfig = { ...config, signal: controller.signal };

        if (attempt > 0 && settings.retryOnProhibitedContent) {
            currentConfig.body = aggressiveRetryTransform(currentConfig.body, attempt);
        }

        try {
            if (settings.debugMode) console.log(`[Fetch Retry] Attempt ${attempt + 1} for ${url}`);

            const response = await originalFetch(resource, currentConfig);
            clearTimeout(timeout);

            if (!response.ok) {
                if (response.status === 429 || response.status >= 500) {
                    throw { status: response.status, message: response.statusText };
                }
                return response;
            }

            const validation = await validateResponse(response, url);
            if (!validation.ok) throw { status: 'VALIDATION_FAILED', reason: validation.reason };

            return response;

        } catch (err) {
            clearTimeout(timeout);
            lastError = err;
            attempt++;

            if (attempt > settings.maxRetries) break;

            const isRateLimit = err.status === 429 || err.reason === 'rate_limited';

            const baseDelay = isRateLimit ? settings.rateLimitDelay : settings.retryDelay;

            let delay = baseDelay * Math.pow(1.5, attempt);

            const finalDelay = Math.min(delay, settings.maxRetryDelay);

            if (settings.debugMode) console.log(`[Fetch Retry] Wait ${finalDelay}ms before next attempt.`);
            
            await new Promise(r => setTimeout(r, finalDelay));
        }
    }

    toastr.error(`All ${settings.maxRetries} retries failed for ${url}`);
    throw lastError;
};

// --- UI & Lifecycle ---

function loadSettings() {
    const context = SillyTavern.getContext();
    if (!context.extensionSettings[settingsKey]) {
        context.extensionSettings[settingsKey] = { ...defaultSettings };
    }
    settings = context.extensionSettings[settingsKey];
}

const uiElements = [
    { id: 'enabled', type: 'checkbox', label: 'Enable Extension' },
    { id: 'maxRetries', type: 'number', label: 'Max Retries', min: 0, max: 1000 },
    { id: 'retryDelay', type: 'number', label: 'Base Delay (ms)', step: 100 },
	{ id: 'maxRetryDelay', type: 'number', label: 'Max Retry Delay (ms)', step: 1000 },
    { id: 'thinkingTimeout', type: 'number', label: 'AI Thinking Timeout (ms)', step: 1000 },
    { id: 'checkEmptyResponse', type: 'checkbox', label: 'Retry on Empty Responses' },
    { id: 'minWordCount', type: 'number', label: 'Min Word Count' },
    { id: 'retryOnProhibitedContent', type: 'checkbox', label: 'Aggressive Filter Bypass' },
    { id: 'debugMode', type: 'checkbox', label: 'Verbose Logging' },
];

function renderSettings() {
    const container = $('#extensions_settings2');
    if ($(`#${settingsKey}-drawer`).length) return;

    const html = `
        <div id="${settingsKey}-drawer" class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Fetch Retry</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="setup-item" style="padding: 10px; display: flex; flex-direction: column; gap: 10px;">
                    ${uiElements.map(el => `
                        <div class="flex-container flexGap5">
                            <label for="fr-${el.id}">${el.label}</label>
                            <input type="${el.type}" id="fr-${el.id}" 
                                ${el.type === 'checkbox' ? (settings[el.id] ? 'checked' : '') : `value="${settings[el.id]}"`} 
                                ${el.min !== undefined ? `min="${el.min}"` : ''} 
                                class="text_pole">
                        </div>
                    `).join('')}
                    <button id="fr-save" class="menu_button">Apply & Save Settings</button>
                </div>
            </div>
        </div>
    `;

    container.append(html);

    $('#fr-save').on('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        uiElements.forEach(el => {
            const input = $(`#fr-${el.id}`);
            const val = el.type === 'checkbox' ? input.prop('checked') : Number(input.val());
            settings[el.id] = val;
        });
        
        SillyTavern.getContext().saveSettingsDebounced();
        toastr.success('Fetch Retry settings saved!');
    });
}

(function init() {
    loadSettings();
    renderSettings();
    console.log('[Fetch Retry] Loaded');
})();

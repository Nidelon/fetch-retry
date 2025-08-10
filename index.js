// == SillyTavern Extension: Fetch Retry ==
// Otomatis retry semua fetch yang error, bisa diatur jumlah retry dan delaynya.

let fetchRetrySettings = {
    enabled: true,
    maxRetries: 5,
    retryDelay: 1000, // ms
    rateLimitDelay: 5000, // ms untuk 429 errors
    thinkingTimeout: 60000, // ms, timeout untuk proses reasoning
    checkEmptyResponse: true,
    minWordCount: 10, // minimum kata dalam response
    emptyResponseRetry: true, // retry jika response terlalu pendek
};

// UI settings
const settingsHtml = `
    <div style="margin-bottom:8px;">
        <label><input type="checkbox" id="fetch-retry-enabled"> Enable Fetch Retry</label>
    </div>
    <div style="margin-bottom:8px;">
        <label>Max Retries: <input type="number" id="fetch-retry-max" min="1" max="10" value="5" style="width:50px;"></label>
    </div>
    <div style="margin-bottom:8px;">
        <label>Retry Delay (ms): <input type="number" id="fetch-retry-delay" min="100" max="10000" value="1000" style="width:70px;"></label>
    </div>
    <div style="margin-bottom:8px;">
        <label>Rate Limit Delay (ms): <input type="number" id="fetch-retry-rate-limit-delay" min="1000" max="30000" value="5000" style="width:70px;"></label>
        <small style="display:block;color:#666;">Delay khusus untuk 429 Too Many Requests</small>
    </div>
    <div style="margin-bottom:8px;">
        <label>Thinking Timeout (ms): <input type="number" id="fetch-retry-thinking-timeout" min="5000" max="120000" value="60000" style="width:70px;"></label>
        <small style="display:block;color:#666;">Waktu maksimum menunggu AI sebelum retry (deteksi proses stuck)</small>
    </div>
    <div style="margin-bottom:8px;">
        <label><input type="checkbox" id="fetch-retry-check-empty"> Check Empty Response</label>
        <small style="display:block;color:#666;">Retry jika response terlalu pendek (mungkin terputus)</small>
    </div>
    <div style="margin-bottom:8px;">
        <label>Min Word Count: <input type="number" id="fetch-retry-min-words" min="1" max="100" value="10" style="width:50px;"></label>
        <small style="display:block;color:#666;">Response dengan kata kurang dari ini akan diretry</small>
    </div>
`;

function loadSettings(settings) {
    if (settings) {
        fetchRetrySettings = { ...fetchRetrySettings, ...settings };
    }
}

function saveSettings() {
    return { ...fetchRetrySettings };
}

function applySettingsToUI() {
    (/** @type {HTMLInputElement} */ (document.getElementById('fetch-retry-enabled'))).checked = fetchRetrySettings.enabled;
    (/** @type {HTMLInputElement} */ (document.getElementById('fetch-retry-max'))).value = String(fetchRetrySettings.maxRetries);
    (/** @type {HTMLInputElement} */ (document.getElementById('fetch-retry-delay'))).value = String(fetchRetrySettings.retryDelay);
    (/** @type {HTMLInputElement} */ (document.getElementById('fetch-retry-rate-limit-delay'))).value = String(fetchRetrySettings.rateLimitDelay);
    (/** @type {HTMLInputElement} */ (document.getElementById('fetch-retry-thinking-timeout'))).value = String(fetchRetrySettings.thinkingTimeout);
    (/** @type {HTMLInputElement} */ (document.getElementById('fetch-retry-check-empty'))).checked = fetchRetrySettings.checkEmptyResponse;
    (/** @type {HTMLInputElement} */ (document.getElementById('fetch-retry-min-words'))).value = String(fetchRetrySettings.minWordCount);
}

function setupSettingsUI() {
    setTimeout(() => {
        applySettingsToUI();
        document.getElementById('fetch-retry-enabled').addEventListener('change', e => {
            fetchRetrySettings.enabled = (/** @type {HTMLInputElement} */ (e.target)).checked;
        });
        document.getElementById('fetch-retry-max').addEventListener('input', e => {
            fetchRetrySettings.maxRetries = parseInt((/** @type {HTMLInputElement} */ (e.target)).value) || 1;
        });
        document.getElementById('fetch-retry-delay').addEventListener('input', e => {
            fetchRetrySettings.retryDelay = parseInt((/** @type {HTMLInputElement} */ (e.target)).value) || 1000;
        });
        document.getElementById('fetch-retry-rate-limit-delay').addEventListener('input', e => {
            fetchRetrySettings.rateLimitDelay = parseInt((/** @type {HTMLInputElement} */ (e.target)).value) || 5000;
        });
        document.getElementById('fetch-retry-thinking-timeout').addEventListener('input', e => {
            fetchRetrySettings.thinkingTimeout = parseInt((/** @type {HTMLInputElement} */ (e.target)).value) || 60000;
        });
        document.getElementById('fetch-retry-check-empty').addEventListener('change', e => {
            fetchRetrySettings.checkEmptyResponse = (/** @type {HTMLInputElement} */ (e.target)).checked;
        });
        document.getElementById('fetch-retry-min-words').addEventListener('input', e => {
            fetchRetrySettings.minWordCount = parseInt((/** @type {HTMLInputElement} */ (e.target)).value) || 10;
        });
    }, 100);
}

// Helper function untuk cek apakah response terlalu pendek/kosong
async function isResponseTooShort(response, url = '') {
    if (!fetchRetrySettings.checkEmptyResponse) {
        return false;
    }

    // Hanya periksa endpoint generasi untuk respons pendek untuk menghindari positif palsu
    const generationEndpoints = ['/completion', '/generate', '/chat/completions', '/run/predict'];
    const isGenerationUrl = generationEndpoints.some(endpoint => url.includes(endpoint));

    if (!isGenerationUrl) {
        return false;
    }
    
    try {
        // Clone response agar bisa dibaca lagi nanti
        const clonedResponse = response.clone();
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
            const data = await clonedResponse.json();
            
            // Check berbagai format response AI/chat
            let textToCheck = '';
            
            // Format OpenAI/Claude
            if (data.choices && data.choices[0] && data.choices[0].message) {
                textToCheck = data.choices[0].message.content || '';
            }
            // Format streaming completion
            else if (data.choices && data.choices[0] && data.choices[0].text) {
                textToCheck = data.choices[0].text || '';
            }
            // Format lainnya
            else if (data.response) {
                textToCheck = data.response;
            } else if (data.text) {
                textToCheck = data.text;
            } else if (data.message) {
                textToCheck = data.message;
            } else if (typeof data === 'string') {
                textToCheck = data;
            }
            
            // Hitung jumlah kata
            const wordCount = textToCheck.trim().split(/\s+/).filter(word => word.length > 0).length;
            const isTooShort = wordCount < fetchRetrySettings.minWordCount && wordCount > 0;
            
            if (isTooShort) {
                console.warn(`[Fetch Retry] Response too short: ${wordCount} words (min: ${fetchRetrySettings.minWordCount})`);
                console.warn(`[Fetch Retry] Content: "${textToCheck.substring(0, 100)}..."`);
            }
            
            return isTooShort;
        } 
        else if (contentType.includes('text/')) {
            const text = await clonedResponse.text();
            const wordCount = text.trim().split(/\s+/).filter(word => word.length > 0).length;
            const isTooShort = wordCount < fetchRetrySettings.minWordCount && wordCount > 0;
            
            if (isTooShort) {
                console.warn(`[Fetch Retry] Text response too short: ${wordCount} words (min: ${fetchRetrySettings.minWordCount})`);
            }
            
            return isTooShort;
        }
    } catch (err) {
        console.warn('[Fetch Retry] Error checking response length:', err);
    }
    
    return false;
}
// Helper function untuk menentukan delay berdasarkan error
function getRetryDelay(error, response, attempt, isShortResponse = false) {
    // Jika ada Retry-After header, gunakan itu
    if (response && response.headers.has('Retry-After')) {
        const retryAfter = response.headers.get('Retry-After');
        const seconds = parseInt(retryAfter);
        if (!isNaN(seconds)) {
            return Math.min(seconds * 1000, 30000); // Max 30 detik
        }
    }
    
    // Untuk 429 errors, gunakan delay yang lebih lama
    if (response && response.status === 429) {
        return fetchRetrySettings.rateLimitDelay * Math.pow(1.5, attempt); // Exponential backoff
    }
    
    // Untuk response yang terlalu pendek, gunakan delay yang lebih singkat
    if (isShortResponse) {
        return Math.max(500, fetchRetrySettings.retryDelay * 0.5); // Setengah dari normal delay, min 500ms
    }
    
    // Default delay dengan exponential backoff
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
        
        while (attempt <= fetchRetrySettings.maxRetries) {
            const controller = new AbortController();
            const signal = controller.signal;
            let timeoutId;

            // Tambahkan signal ke args jika belum ada
            const fetchArgs = [...args];
            if (fetchArgs[0] instanceof Request) {
                // Tidak bisa memodifikasi Request object secara langsung, perlu buat baru
                const newRequest = new Request(fetchArgs[0], { signal });
                fetchArgs[0] = newRequest;
            } else {
                fetchArgs[1] = Object.assign({}, fetchArgs[1], { signal });
            }

            try {
                const fetchPromise = originalFetch.apply(this, fetchArgs);

                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        const error = new Error('Thinking timeout reached');
                        error.name = 'TimeoutError';
                        controller.abort();
                        reject(error);
                    }, fetchRetrySettings.thinkingTimeout);
                });

                const result = await Promise.race([fetchPromise, timeoutPromise]);
                clearTimeout(timeoutId); // Hapus timeout jika fetch berhasil

                lastResponse = result;
                
                // Sukses jika status 200-299
                if (result.ok) {
                    // Check apakah response terlalu pendek (mungkin terputus)
                    const url = args[0] instanceof Request ? args[0].url : String(args[0]);
                    const isTooShort = await isResponseTooShort(result, url);
                    if (isTooShort && attempt < fetchRetrySettings.maxRetries) {
                        console.warn(`[Fetch Retry] Response too short, retrying... attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                        const delay = getRetryDelay(null, result, attempt, true);
                        console.log(`[Fetch Retry] Waiting ${delay}ms before retry for short response...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        attempt++;
                        continue; // Retry tanpa increment yang akan terjadi di catch
                    }
                    return result;
                }
                
                // Handle specific error codes
                if (result.status === 429) {
                    console.warn(`[Fetch Retry] Rate limited (429), attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                } else if (result.status >= 500) {
                    console.warn(`[Fetch Retry] Server error (${result.status}), attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                } else if (result.status >= 400) {
                    // Client errors selain 429 biasanya tidak perlu diretry
                    throw new Error(`HTTP ${result.status}: ${result.statusText}`);
                }
                
                throw new Error(`HTTP ${result.status}: ${result.statusText}`);
                
            } catch (err) {
                clearTimeout(timeoutId); // Pastikan timeout dihapus jika ada error lain
                lastError = err;

                // Jika request dibatalkan oleh pengguna, jangan retry
                // TimeoutError yang kita buat akan di-retry
                if (err.name === 'AbortError') {
                    console.log('[Fetch Retry] Fetch was aborted by user, not retrying.');
                    throw err;
                }
                
                if (err.name === 'TimeoutError') {
                    console.warn(`[Fetch Retry] AI thinking timeout (${fetchRetrySettings.thinkingTimeout}ms), retrying... attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                } else {
                    console.warn(`[Fetch Retry] Error: ${err.message}, attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                }
                
                // Jika sudah mencapai max retry, throw error
                if (attempt >= fetchRetrySettings.maxRetries) {
                    break;
                }
                
                // Tentukan delay untuk retry
                const delay = getRetryDelay(err, lastResponse, attempt);
                console.log(`[Fetch Retry] Waiting ${delay}ms before retry...`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
                attempt++;
            }
        }
        
        // Jika sampai sini, berarti semua attempt gagal
        console.error(`[Fetch Retry] All ${fetchRetrySettings.maxRetries + 1} attempts failed`);
        throw lastError;
    };
    
    (/** @type {any} */ (window))._fetchRetryPatched = true;
    console.log('[Fetch Retry] Extension loaded and fetch patched');
}

export default {
    id: 'fetch-retry',
    name: 'Fetch Retry',
    description: 'Otomatis retry semua fetch yang error dengan handling khusus untuk 429 dan response terlalu pendek.',
    settings: fetchRetrySettings,
    settingsHtml,
    loadSettings,
    saveSettings,
    onSettingsUI: setupSettingsUI,
};

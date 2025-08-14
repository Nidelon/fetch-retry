// == SillyTavern Extension: Fetch Retry Admin Module ==
// This module provides more aggressive and experimental strategies for retrying failed requests.
// It is intended to be used when standard retry mechanisms are insufficient.

// A map of sensitive words to neutral replacements.
// YOU NEED TO REPLACE THIS, BECAUSE THIS IS A DEFAULT WORD, YOU NEED TO ADD IT MANUALLY, You can dm me @_jxxy40 on discoed if you want the full version of wordReplacementMap 
const wordReplacementMap = {
    'kill': 'defeat',
    'murder': 'vanquish',
    'blood': 'red fluid',
    'die': 'pass away',
    'sex': 'intimacy',
    'sexual': 'intimate',
    'rape': 'assault',
    'torture': 'interrogate intensely',
    'violence': 'conflict',
    'violent': 'intense',
    'abuse': 'mistreatment',
};

// Create a regex from the map keys for efficient replacement.
const forbiddenWordsRegex = new RegExp(Object.keys(wordReplacementMap).join('|'), 'gi');

/**
 * Aggressively transforms the request body to bypass content filters using a multi-step strategy.
 *
 * @param {object} requestBody - The original request body (as a parsed JSON object).
 * @param {number} attempt - The current retry attempt number (0 is the first attempt, 1 is the first retry, etc.).
 * @returns {object} The modified request body.
 */
export function aggressiveRetryTransform(requestBody, attempt) {
    console.log(`[Fetch Retry Admin] aggressiveRetryTransform called for attempt: ${attempt}.`);
    if (!requestBody || !requestBody.messages || !Array.isArray(requestBody.messages)) {
        console.log('[Fetch Retry Admin] Invalid requestBody or messages array. Returning original requestBody.');
        return requestBody;
    }

    // Clone the messages to avoid modifying the original object in unexpected ways.
    let modifiedMessages = JSON.parse(JSON.stringify(requestBody.messages));

    switch (attempt) {
        // Step 1: Sanitize all messages using the word replacement map.
        case 1:
            console.log('[Fetch Retry Admin] Step 1: Sanitizing words.');
            modifiedMessages = modifiedMessages.map(msg => {
                // Handle both simple string content and complex content (like Gemini's `parts` array)
                if (msg.content && typeof msg.content === 'string') {
                    msg.content = msg.content.replace(forbiddenWordsRegex, (matched) => {
                        return wordReplacementMap[matched.toLowerCase()] || matched;
                    });
                } else if (Array.isArray(msg.parts)) {
                    msg.parts = msg.parts.map(part => {
                        if (part.text && typeof part.text === 'string') {
                            part.text = part.text.replace(forbiddenWordsRegex, (matched) => {
                                return wordReplacementMap[matched.toLowerCase()] || matched;
                            });
                        }
                        return part;
                    });
                }
                return msg;
            });
            break;

        // Step 2: Mark the request as unrecoverable to stop the loop.
        case 2:
        default:
            console.log(`[Fetch Retry Admin] Step 2+ (Attempt ${attempt}): Transformations failed. Marking as unrecoverable.`);
            requestBody.unrecoverable = true;
            break;
    }

    requestBody.messages = modifiedMessages;
    console.log('[Fetch Retry Admin] Request body modified.');
    return requestBody;
}

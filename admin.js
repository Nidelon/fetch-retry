const wordReplacementMap = {
    'kill': 'defeat',
    'murder': 'overcome',
    'blood': 'crimson',
    'sex': 'intimacy',
    'rape': 'harsh violation',
    'torture': 'extreme pressure',
};

const forbiddenRegex = new RegExp(`\\b(${Object.keys(wordReplacementMap).join('|')})\\b`, 'gi');

export function aggressiveRetryTransform(body, attempt) {
    if (!body || typeof body !== 'string') return body;

    try {
        let json = JSON.parse(body);

        if (json.messages && Array.isArray(json.messages)) {
            json.messages = json.messages.map(msg => {
                if (typeof msg.content === 'string') {
                    if (attempt === 1) {
                        msg.content = msg.content.replace(forbiddenRegex, match => wordReplacementMap[match.toLowerCase()] || match);
                    }
                }
                return msg;
            });
        }

        return JSON.stringify(json);
    } catch (e) {
        return body;
    }
}

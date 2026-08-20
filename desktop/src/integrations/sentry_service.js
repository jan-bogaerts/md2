function requireRequest(request) {
    if (!request || typeof request !== 'object') throw new Error('Missing Sentry request');
    if (typeof request.url !== 'string' || request.url.length === 0) throw new Error('Missing Sentry request URL');
    if (typeof request.apiToken !== 'string' || request.apiToken.length === 0) throw new Error('Missing Sentry API token');

    const url = new URL(request.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Sentry request URL must use HTTP or HTTPS');

    return { apiToken: request.apiToken, url: url.toString() };
}

/** Sends a Sentry Web API request outside Chromium's cross-origin restrictions. */
async function sendSentryRequest(request, fetchRequest = globalThis.fetch.bind(globalThis)) {
    const { apiToken, url } = requireRequest(request);
    const response = await fetchRequest(url, {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${apiToken}`,
        },
    });

    return {
        body: await response.text(),
        headers: {
            link: response.headers.get('Link'),
            retryAfter: response.headers.get('Retry-After'),
        },
        status: response.status,
    };
}

module.exports = { sendSentryRequest };

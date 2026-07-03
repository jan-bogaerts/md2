const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'

const JSON_ACCEPT_HEADERS = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
}

function requireString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing GitHub OAuth request field: ${fieldName}`)

    return value
}

function buildRequestBody(fields) {
    const body = new URLSearchParams()

    Object.entries(fields).forEach(([key, value]) => {
        body.set(key, value)
    })

    return body
}

async function postGithubOAuthRequest(url, fields, fetchImplementation = fetch) {
    const response = await fetchImplementation(url, {
        body: buildRequestBody(fields),
        headers: JSON_ACCEPT_HEADERS,
        method: 'POST',
    })

    const payload = await response.json()

    if (!response.ok) throw new Error(`GitHub OAuth request failed with status ${response.status}`)

    return payload
}

async function requestGithubDeviceCode(request, fetchImplementation = fetch) {
    const fields = {
        client_id: requireString(request.clientId, 'clientId'),
        scope: requireString(request.scope, 'scope'),
    }

    return postGithubOAuthRequest(GITHUB_DEVICE_CODE_URL, fields, fetchImplementation)
}

async function requestGithubAccessToken(request, fetchImplementation = fetch) {
    const fields = {
        client_id: requireString(request.clientId, 'clientId'),
        device_code: requireString(request.deviceCode, 'deviceCode'),
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }

    return postGithubOAuthRequest(GITHUB_TOKEN_URL, fields, fetchImplementation)
}

module.exports = {
    GITHUB_DEVICE_CODE_URL,
    GITHUB_TOKEN_URL,
    requestGithubAccessToken,
    requestGithubDeviceCode,
}

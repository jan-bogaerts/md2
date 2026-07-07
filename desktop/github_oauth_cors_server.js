const http = require('node:http')

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const DEVICE_CODE_PATH = '/github/oauth/device/code'
const ACCESS_TOKEN_PATH = '/github/oauth/access_token'
const HEALTH_CHECK_PATH = '/healthz'
const DEFAULT_PORT = 8787
const JSON_CONTENT_TYPE = 'application/json'
const MAX_BODY_BYTES = 8192
const DEVICE_CODE_FIELDS = ['clientId', 'scope']
const ACCESS_TOKEN_FIELDS = ['clientId', 'deviceCode']
const GITHUB_DEVICE_CODE_FIELDS = ['client_id', 'scope']
const GITHUB_ACCESS_TOKEN_FIELDS = ['client_id', 'device_code', 'grant_type']
const DEVICE_CODE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
const JSON_ACCEPT_HEADERS = {
    Accept: JSON_CONTENT_TYPE,
    'Content-Type': 'application/x-www-form-urlencoded',
}

function parseCsv(value) {
    if (!value) return []

    return value.split(',').map((item) => item.trim()).filter((item) => item.length > 0)
}

function createConfig(env = process.env) {
    return {
        allowedOrigins: parseCsv(env.MD2_GITHUB_OAUTH_ALLOWED_ORIGINS),
        expectedClientId: env.MD2_GITHUB_OAUTH_CLIENT_ID?.trim() || null,
        port: Number.parseInt(env.MD2_GITHUB_OAUTH_PROXY_PORT || `${DEFAULT_PORT}`, 10),
    }
}

function writeJson(response, statusCode, payload, origin = null) {
    const headers = {'Content-Type': JSON_CONTENT_TYPE}

    if (origin) {
        headers['Access-Control-Allow-Origin'] = origin
        headers.Vary = 'Origin'
    }

    response.writeHead(statusCode, headers)
    response.end(JSON.stringify(payload))
}

function writeText(response, statusCode, message, origin = null) {
    const headers = {'Content-Type': 'text/plain'}

    if (origin) {
        headers['Access-Control-Allow-Origin'] = origin
        headers.Vary = 'Origin'
    }

    response.writeHead(statusCode, headers)
    response.end(message)
}

function getAllowedOrigin(request, allowedOrigins) {
    const origin = request.headers.origin

    if (!origin) return null
    if (allowedOrigins.includes(origin)) return origin

    throw new Error('Origin is not allowed')
}

function writeCorsPreflight(response, origin) {
    const headers = {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST',
    }

    if (origin) {
        headers['Access-Control-Allow-Origin'] = origin
        headers.Vary = 'Origin'
    }

    response.writeHead(204, headers)
    response.end()
}

function requireString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing GitHub OAuth request field: ${fieldName}`)

    return value
}

function assertAllowedFields(body, allowedFields) {
    const fields = Object.keys(body)
    const extraField = fields.find((field) => !allowedFields.includes(field))

    if (extraField) throw new Error(`Unsupported GitHub OAuth request field: ${extraField}`)
}

function assertExpectedClientId(clientId, expectedClientId) {
    if (expectedClientId && clientId !== expectedClientId) throw new Error('Unsupported GitHub OAuth client id')
}

function buildFormBody(fields) {
    const body = new URLSearchParams()

    Object.entries(fields).forEach(([key, value]) => {
        body.set(key, value)
    })

    return body
}

function buildDeviceCodeFields(body, expectedClientId) {
    assertAllowedFields(body, DEVICE_CODE_FIELDS)

    const clientId = requireString(body.clientId, 'clientId')
    assertExpectedClientId(clientId, expectedClientId)

    return {
        client_id: clientId,
        scope: requireString(body.scope, 'scope'),
    }
}

function buildAccessTokenFields(body, expectedClientId) {
    assertAllowedFields(body, ACCESS_TOKEN_FIELDS)

    const clientId = requireString(body.clientId, 'clientId')
    assertExpectedClientId(clientId, expectedClientId)

    return {
        client_id: clientId,
        device_code: requireString(body.deviceCode, 'deviceCode'),
        grant_type: DEVICE_CODE_GRANT_TYPE,
    }
}

function assertForwardFields(fields, allowedFields) {
    const extraField = Object.keys(fields).find((field) => !allowedFields.includes(field))

    if (extraField) throw new Error(`Unsupported GitHub OAuth forwarded field: ${extraField}`)
}

async function readJsonBody(request) {
    const chunks = []
    let size = 0

    for await (const chunk of request) {
        size += chunk.length
        if (size > MAX_BODY_BYTES) throw new Error('GitHub OAuth request body is too large')
        chunks.push(chunk)
    }

    const rawBody = Buffer.concat(chunks).toString('utf8')

    if (rawBody.length === 0) throw new Error('Missing GitHub OAuth request body')

    const body = JSON.parse(rawBody)

    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Invalid GitHub OAuth request body')

    return body
}

async function postGithubOAuthRequest(url, fields, fetchImplementation = fetch) {
    const response = await fetchImplementation(url, {
        body: buildFormBody(fields),
        headers: JSON_ACCEPT_HEADERS,
        method: 'POST',
    })
    const responseBody = await response.text()

    return {
        body: responseBody,
        statusCode: response.status,
    }
}

async function handleOAuthRequest(request, response, route, config, fetchImplementation) {
    const origin = getAllowedOrigin(request, config.allowedOrigins)

    if (request.method === 'OPTIONS') {
        writeCorsPreflight(response, origin)
        return
    }

    if (request.method !== 'POST') {
        writeText(response, 405, 'Method not allowed', origin)
        return
    }

    if (!String(request.headers['content-type'] || '').startsWith(JSON_CONTENT_TYPE)) {
        writeJson(response, 415, { error: 'unsupported_media_type' }, origin)
        return
    }

    const body = await readJsonBody(request)
    const fields = route.buildFields(body, config.expectedClientId)
    assertForwardFields(fields, route.githubFields)
    const githubResponse = await postGithubOAuthRequest(route.url, fields, fetchImplementation)
    const responseHeaders = {'Content-Type': JSON_CONTENT_TYPE}

    if (origin) {
        responseHeaders['Access-Control-Allow-Origin'] = origin
        responseHeaders.Vary = 'Origin'
    }

    response.writeHead(githubResponse.statusCode, responseHeaders)
    response.end(githubResponse.body)
}

function createGithubOAuthCorsServer(options = {}) {
    const config = options.config || createConfig()
    const fetchImplementation = options.fetchImplementation || fetch

    return http.createServer(async (request, response) => {
        try {
            if (request.url === HEALTH_CHECK_PATH && request.method === 'GET') {
                writeJson(response, 200, { ok: true })
                return
            }

            if (request.url === DEVICE_CODE_PATH) {
                await handleOAuthRequest(request, response, {
                    buildFields: buildDeviceCodeFields,
                    githubFields: GITHUB_DEVICE_CODE_FIELDS,
                    url: GITHUB_DEVICE_CODE_URL,
                }, config, fetchImplementation)
                return
            }

            if (request.url === ACCESS_TOKEN_PATH) {
                await handleOAuthRequest(request, response, {
                    buildFields: buildAccessTokenFields,
                    githubFields: GITHUB_ACCESS_TOKEN_FIELDS,
                    url: GITHUB_TOKEN_URL,
                }, config, fetchImplementation)
                return
            }

            writeText(response, 404, 'Not found')
        } catch (error) {
            const origin = request.headers.origin && config.allowedOrigins.includes(request.headers.origin) ? request.headers.origin : null
            const statusCode = error.message === 'Origin is not allowed' ? 403 : 400

            writeJson(response, statusCode, { error: error.message }, origin)
        }
    })
}

function startGithubOAuthCorsServer(options = {}) {
    const config = options.config || createConfig()
    const server = createGithubOAuthCorsServer({ ...options, config })

    if (config.allowedOrigins.length === 0) throw new Error('Missing required MD2_GITHUB_OAUTH_ALLOWED_ORIGINS')

    server.listen(config.port)

    return server
}

module.exports = {
    ACCESS_TOKEN_PATH,
    DEVICE_CODE_PATH,
    GITHUB_DEVICE_CODE_URL,
    GITHUB_TOKEN_URL,
    HEALTH_CHECK_PATH,
    createConfig,
    createGithubOAuthCorsServer,
    startGithubOAuthCorsServer,
}

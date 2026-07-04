import type { GithubAuthConfig } from './github_auth_config'
import { getGithubAuthBridge } from './github_auth_bridge'
import {
    GITHUB_DEVICE_CODE_URL,
    GITHUB_TOKEN_URL,
    type GithubAccessTokenRequest,
    type GithubDeviceCode,
    type GithubDeviceCodeRequest,
    type GithubOAuthErrorResponse,
    type GithubTokenResponse,
} from './github_auth_types'

interface GithubDeviceCodeApiResponse {
    device_code?: unknown
    error?: unknown
    error_description?: unknown
    expires_in?: unknown
    interval?: unknown
    user_code?: unknown
    verification_uri?: unknown
}

interface GithubTokenApiResponse {
    access_token?: unknown
    error?: unknown
    error_description?: unknown
    scope?: unknown
    token_type?: unknown
}

const JSON_ACCEPT_HEADERS = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
}

function buildProxyUrl(baseUrl: string, endpointPath: string) {
    return `${baseUrl.replace(/\/+$/, '')}${endpointPath}`
}

async function postJson(url: string, body: object) {
    const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: JSON_ACCEPT_HEADERS,
        method: 'POST',
    })

    const payload = await response.json() as unknown

    if (!response.ok) throw new Error(`GitHub OAuth request failed with status ${response.status}`)

    return payload
}

function requireString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing GitHub OAuth field: ${fieldName}`)

    return value
}

function requireNumber(value: unknown, fieldName: string) {
    if (typeof value !== 'number') throw new Error(`Missing GitHub OAuth field: ${fieldName}`)

    return value
}

function normalizeDeviceCodePayload(payload: unknown): GithubDeviceCode | GithubOAuthErrorResponse {
    const response = payload as GithubDeviceCodeApiResponse

    if (typeof response.error === 'string') {
        return {
            error: response.error,
            errorDescription: typeof response.error_description === 'string' ? response.error_description : undefined,
        }
    }

    return {
        deviceCode: requireString(response.device_code, 'device_code'),
        expiresIn: requireNumber(response.expires_in, 'expires_in'),
        interval: requireNumber(response.interval, 'interval'),
        userCode: requireString(response.user_code, 'user_code'),
        verificationUri: requireString(response.verification_uri, 'verification_uri'),
    }
}

function normalizeTokenPayload(payload: unknown): GithubTokenResponse | GithubOAuthErrorResponse {
    const response = payload as GithubTokenApiResponse

    if (typeof response.error === 'string') {
        return {
            error: response.error,
            errorDescription: typeof response.error_description === 'string' ? response.error_description : undefined,
        }
    }

    return {
        accessToken: requireString(response.access_token, 'access_token'),
        scope: requireString(response.scope, 'scope'),
        tokenType: requireString(response.token_type, 'token_type'),
    }
}

async function requestViaBrowserProxy(config: GithubAuthConfig, endpointPath: string, body: object) {
    if (!config.oauthProxyUrl) throw new Error('Missing required GitHub OAuth proxy URL for browser login')

    return postJson(buildProxyUrl(config.oauthProxyUrl, endpointPath), body)
}

export async function requestGithubDeviceCode(config: GithubAuthConfig) {
    const request: GithubDeviceCodeRequest = { clientId: config.clientId, scope: config.scopes }
    const bridge = getGithubAuthBridge()
    const payload = bridge
        ? await bridge.requestDeviceCode(request)
        : await requestViaBrowserProxy(config, '/github/oauth/device/code', request)

    return normalizeDeviceCodePayload(payload)
}

export async function requestGithubAccessToken(config: GithubAuthConfig, deviceCode: string) {
    const request: GithubAccessTokenRequest = { clientId: config.clientId, deviceCode }
    const bridge = getGithubAuthBridge()
    const payload = bridge
        ? await bridge.requestAccessToken(request)
        : await requestViaBrowserProxy(config, '/github/oauth/access_token', request)

    return normalizeTokenPayload(payload)
}

export function getGithubDeviceCodeUrl() {
    return GITHUB_DEVICE_CODE_URL
}

export function getGithubTokenUrl() {
    return GITHUB_TOKEN_URL
}

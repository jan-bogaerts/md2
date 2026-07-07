import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const {
    ACCESS_TOKEN_PATH,
    DEVICE_CODE_PATH,
    GITHUB_DEVICE_CODE_URL,
    GITHUB_TOKEN_URL,
    HEALTH_CHECK_PATH,
    createGithubOAuthCorsServer,
} = require('./github_oauth_cors_server')

const allowedOrigin = 'https://app.example.test'
const foreignOrigin = 'https://foreign.example.test'

function createFetchResponse(payload, status = 200) {
    return {
        status,
        text: async () => JSON.stringify(payload),
    }
}

function createFetchMock(payload, status = 200) {
    return vi.fn().mockResolvedValue(createFetchResponse(payload, status))
}

async function listen(server) {
    await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', resolve)
    })
}

async function close(server) {
    await new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error)
            else resolve()
        })
    })
}

function createTestServer(fetchImplementation = createFetchMock({ ok: true })) {
    const server = createGithubOAuthCorsServer({
        config: {
            allowedOrigins: [allowedOrigin],
            expectedClientId: 'client-id',
            port: 0,
        },
        fetchImplementation,
    })

    return { fetchImplementation, server }
}

function getServerUrl(server, path) {
    const address = server.address()

    if (!address || typeof address !== 'object') throw new Error('Missing test server address')

    return `http://127.0.0.1:${address.port}${path}`
}

async function postJson(server, path, body, origin = allowedOrigin) {
    return fetch(getServerUrl(server, path), {
        body: JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json',
            Origin: origin,
        },
        method: 'POST',
    })
}

describe('github-oauth-cors-server', () => {
    const servers = []

    afterEach(async () => {
        for (const server of servers) {
            await close(server)
        }

        servers.length = 0
    })

    it('reports health', async () => {
        const { server } = createTestServer()
        servers.push(server)
        await listen(server)

        const response = await fetch(getServerUrl(server, HEALTH_CHECK_PATH))

        await expect(response.json()).resolves.toEqual({ ok: true })
        expect(response.status).toBe(200)
    })

    it('forwards device-code requests to GitHub', async () => {
        const fetchImplementation = createFetchMock({ device_code: 'device-code' })
        const { server } = createTestServer(fetchImplementation)
        servers.push(server)
        await listen(server)

        const response = await postJson(server, DEVICE_CODE_PATH, { clientId: 'client-id', scope: 'repo' })

        await expect(response.json()).resolves.toEqual({ device_code: 'device-code' })
        expect(response.headers.get('access-control-allow-origin')).toBe(allowedOrigin)
        expect(fetchImplementation).toHaveBeenCalledWith(GITHUB_DEVICE_CODE_URL, expect.objectContaining({ method: 'POST' }))
        const [, init] = fetchImplementation.mock.calls[0]
        expect(init.body.get('client_id')).toBe('client-id')
        expect(init.body.get('scope')).toBe('repo')
    })

    it('forwards access-token requests to GitHub', async () => {
        const fetchImplementation = createFetchMock({ access_token: 'token', scope: 'repo', token_type: 'bearer' })
        const { server } = createTestServer(fetchImplementation)
        servers.push(server)
        await listen(server)

        const response = await postJson(server, ACCESS_TOKEN_PATH, { clientId: 'client-id', deviceCode: 'device-code' })

        await expect(response.json()).resolves.toEqual({ access_token: 'token', scope: 'repo', token_type: 'bearer' })
        expect(fetchImplementation).toHaveBeenCalledWith(GITHUB_TOKEN_URL, expect.objectContaining({ method: 'POST' }))
        const [, init] = fetchImplementation.mock.calls[0]
        expect(init.body.get('client_id')).toBe('client-id')
        expect(init.body.get('device_code')).toBe('device-code')
        expect(init.body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code')
    })

    it('passes through GitHub OAuth error bodies unchanged', async () => {
        const githubError = { error: 'authorization_pending', error_description: 'pending' }
        const fetchImplementation = createFetchMock(githubError)
        const { server } = createTestServer(fetchImplementation)
        servers.push(server)
        await listen(server)

        const response = await postJson(server, ACCESS_TOKEN_PATH, { clientId: 'client-id', deviceCode: 'device-code' })

        await expect(response.json()).resolves.toEqual(githubError)
        expect(response.status).toBe(200)
    })

    it('rejects foreign origins', async () => {
        const fetchImplementation = createFetchMock({ device_code: 'device-code' })
        const { server } = createTestServer(fetchImplementation)
        servers.push(server)
        await listen(server)

        const response = await postJson(server, DEVICE_CODE_PATH, { clientId: 'client-id', scope: 'repo' }, foreignOrigin)

        await expect(response.json()).resolves.toEqual({ error: 'Origin is not allowed' })
        expect(response.status).toBe(403)
        expect(response.headers.get('access-control-allow-origin')).toBeNull()
        expect(fetchImplementation).not.toHaveBeenCalled()
    })

    it('rejects body fields outside the allow-list', async () => {
        const fetchImplementation = createFetchMock({ device_code: 'device-code' })
        const { server } = createTestServer(fetchImplementation)
        servers.push(server)
        await listen(server)

        const response = await postJson(server, DEVICE_CODE_PATH, { clientId: 'client-id', redirectUri: 'https://example.test', scope: 'repo' })

        await expect(response.json()).resolves.toEqual({ error: 'Unsupported GitHub OAuth request field: redirectUri' })
        expect(response.status).toBe(400)
        expect(fetchImplementation).not.toHaveBeenCalled()
    })
})

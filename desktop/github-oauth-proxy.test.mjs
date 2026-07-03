import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const {
    GITHUB_DEVICE_CODE_URL,
    GITHUB_TOKEN_URL,
    requestGithubAccessToken,
    requestGithubDeviceCode,
} = require('./github-oauth-proxy')

function createFetchMock(payload = { ok: true }) {
    return vi.fn().mockResolvedValue({
        json: async () => payload,
        ok: true,
        status: 200,
    })
}

describe('github-oauth-proxy', () => {
    it('posts the device-code request to GitHub', async () => {
        const fetchMock = createFetchMock({ device_code: 'device-code' })

        await requestGithubDeviceCode({ clientId: 'client-id', scope: 'repo' }, fetchMock)

        const [, init] = fetchMock.mock.calls[0]

        expect(fetchMock.mock.calls[0][0]).toBe(GITHUB_DEVICE_CODE_URL)
        expect(init.method).toBe('POST')
        expect(init.body.get('client_id')).toBe('client-id')
        expect(init.body.get('scope')).toBe('repo')
    })

    it('posts the access-token request to GitHub', async () => {
        const fetchMock = createFetchMock({ access_token: 'token' })

        await requestGithubAccessToken({ clientId: 'client-id', deviceCode: 'device-code' }, fetchMock)

        const [, init] = fetchMock.mock.calls[0]

        expect(fetchMock.mock.calls[0][0]).toBe(GITHUB_TOKEN_URL)
        expect(init.method).toBe('POST')
        expect(init.body.get('client_id')).toBe('client-id')
        expect(init.body.get('device_code')).toBe('device-code')
        expect(init.body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code')
    })
})

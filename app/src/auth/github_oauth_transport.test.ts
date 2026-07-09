import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestGithubAccessToken, requestGithubDeviceCode } from './github_oauth_transport'

const config = {
    clientId: 'client-id',
    oauthProxyUrl: 'https://proxy.example.test',
    scopes: 'repo',
}

describe('githubOAuthTransport', () => {
    afterEach(() => {
        delete window.md2GithubAuth
        vi.unstubAllGlobals()
    })

    it('uses the Electron bridge when it is available', async () => {
        window.md2GithubAuth = {
            requestAccessToken: vi.fn(),
            requestDeviceCode: vi.fn().mockResolvedValue({
                device_code: 'device-code',
                expires_in: 900,
                interval: 5,
                user_code: 'ABCD-1234',
                verification_uri: 'https://github.com/login/device',
            }),
        }

        await expect(requestGithubDeviceCode(config)).resolves.toMatchObject({
            deviceCode: 'device-code',
            userCode: 'ABCD-1234',
        })

        expect(window.md2GithubAuth.requestDeviceCode).toHaveBeenCalledWith({ clientId: 'client-id', scope: 'repo' })
    })

    it('uses the configured browser proxy without the Electron bridge', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            json: async () => ({
                access_token: 'token',
                scope: 'repo',
                token_type: 'bearer',
            }),
            ok: true,
            status: 200,
        })
        vi.stubGlobal('fetch', fetchMock)

        await expect(requestGithubAccessToken(config, 'device-code')).resolves.toEqual({
            accessToken: 'token',
            scope: 'repo',
            tokenType: 'bearer',
        })

        expect(fetchMock).toHaveBeenCalledWith(
            'https://proxy.example.test/github/oauth/access_token',
            expect.objectContaining({ method: 'POST' }),
        )
    })

    it('requires a client id for device-flow login', async () => {
        await expect(requestGithubDeviceCode({ ...config, clientId: null })).rejects.toThrow('Missing required GitHub auth config: GITHUB_CLIENT_ID')
    })
})

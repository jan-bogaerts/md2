import { describe, expect, it } from 'vitest'
import { readGithubAuthConfig } from './github_auth_config'

describe('readGithubAuthConfig', () => {
    it('reads required and optional GitHub auth environment values', () => {
        const config = readGithubAuthConfig({
            GITHUB_CLIENT_ID: 'client-id',
            GITHUB_OAUTH_PROXY_URL: 'https://proxy.example.test',
            GITHUB_OAUTH_SCOPES: 'repo read:user',
        })

        expect(config).toEqual({
            clientId: 'client-id',
            oauthProxyUrl: 'https://proxy.example.test',
            scopes: 'repo read:user',
        })
    })

    it('fails fast when the GitHub client id is missing', () => {
        expect(() => readGithubAuthConfig({})).toThrow('Missing required GitHub auth config: GITHUB_CLIENT_ID')
    })
})

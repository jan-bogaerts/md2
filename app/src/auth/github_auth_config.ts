const DEFAULT_GITHUB_SCOPES = 'repo'

export interface GithubAuthConfig {
    clientId: string | null
    oauthProxyUrl: string | null
    scopes: string
}

export interface GithubAuthEnv {
    readonly GITHUB_CLIENT_ID?: string
    readonly GITHUB_OAUTH_PROXY_URL?: string
    readonly GITHUB_OAUTH_SCOPES?: string
}

function getOptionalEnvValue(env: GithubAuthEnv, key: keyof GithubAuthEnv) {
    const value = env[key]?.trim()

    return value && value.length > 0 ? value : null
}

export function readGithubAuthConfig(env: GithubAuthEnv = import.meta.env as unknown as GithubAuthEnv): GithubAuthConfig {
    return {
        clientId: getOptionalEnvValue(env, 'GITHUB_CLIENT_ID'),
        oauthProxyUrl: getOptionalEnvValue(env, 'GITHUB_OAUTH_PROXY_URL'),
        scopes: getOptionalEnvValue(env, 'GITHUB_OAUTH_SCOPES') ?? DEFAULT_GITHUB_SCOPES,
    }
}

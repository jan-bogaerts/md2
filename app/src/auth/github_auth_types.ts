export const AUTH_TOKEN_STORAGE_KEY = 'md2.github.accessToken'
export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code'
export const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
export const GITHUB_USER_URL = 'https://api.github.com/user'
export const GITHUB_AUTH_POLLING_FALLBACK_SECONDS = 5
export const GITHUB_AUTH_SLOW_DOWN_SECONDS = 5
export const SECONDS_TO_MILLISECONDS = 1000

export type GithubDeviceFlowStatus = 'idle' | 'requesting-code' | 'waiting' | 'authenticated' | 'denied' | 'expired' | 'error'

export interface GithubDeviceCode {
    deviceCode: string
    expiresIn: number
    interval: number
    userCode: string
    verificationUri: string
}

export interface GithubTokenResponse {
    accessToken: string
    scope: string
    tokenType: string
}

export interface GithubOAuthErrorResponse {
    error: string
    errorDescription?: string
}

export interface GithubUser {
    avatarUrl: string | null
    htmlUrl: string
    id: number
    login: string
    name: string | null
}

export interface AuthSnapshot {
    deviceCode: GithubDeviceCode | null
    errorMessage: string | null
    isAuthenticated: boolean
    isLoadingUser: boolean
    status: GithubDeviceFlowStatus
    user: GithubUser | null
}

export interface GithubOAuthBridge {
    requestDeviceCode(request: GithubDeviceCodeRequest): Promise<unknown>
    requestAccessToken(request: GithubAccessTokenRequest): Promise<unknown>
}

export interface GithubDeviceCodeRequest {
    clientId: string
    scope: string
}

export interface GithubAccessTokenRequest {
    clientId: string
    deviceCode: string
}

export interface AuthStorage {
    getItem(key: string): string | null
    removeItem(key: string): void
    setItem(key: string, value: string): void
}

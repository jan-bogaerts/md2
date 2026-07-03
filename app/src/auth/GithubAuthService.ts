import { readGithubAuthConfig, type GithubAuthConfig } from './githubAuthConfig'
import { fetchGithubUser, GithubUnauthorizedError } from './githubApiClient'
import {
    AUTH_TOKEN_STORAGE_KEY,
    GITHUB_AUTH_POLLING_FALLBACK_SECONDS,
    GITHUB_AUTH_SLOW_DOWN_SECONDS,
    SECONDS_TO_MILLISECONDS,
    type AuthSnapshot,
    type AuthStorage,
    type GithubDeviceCode,
    type GithubOAuthErrorResponse,
    type GithubTokenResponse,
    type GithubUser,
} from './githubAuthTypes'
import { requestGithubAccessToken, requestGithubDeviceCode } from './githubOAuthTransport'

type AuthListener = (snapshot: AuthSnapshot) => void
type DelayId = ReturnType<typeof window.setTimeout>

interface GithubAuthServiceDependencies {
    clearDelay: (delayId: DelayId) => void
    config: GithubAuthConfig
    fetchUser: (accessToken: string) => Promise<GithubUser>
    requestAccessToken: (config: GithubAuthConfig, deviceCode: string) => Promise<GithubTokenResponse | GithubOAuthErrorResponse>
    requestDeviceCode: (config: GithubAuthConfig) => Promise<GithubDeviceCode | GithubOAuthErrorResponse>
    setDelay: (callback: () => void, delayMs: number) => DelayId
    storage: AuthStorage
}

const INITIAL_AUTH_SNAPSHOT: AuthSnapshot = {
    deviceCode: null,
    errorMessage: null,
    isAuthenticated: false,
    isLoadingUser: false,
    status: 'idle',
    user: null,
}

function isOAuthError(payload: GithubTokenResponse | GithubDeviceCode | GithubOAuthErrorResponse): payload is GithubOAuthErrorResponse {
    return 'error' in payload
}

function buildAuthErrorMessage(error: GithubOAuthErrorResponse) {
    return error.errorDescription ?? `GitHub authorization failed: ${error.error}`
}

function getStoredAccessToken(storage: AuthStorage) {
    return storage.getItem(AUTH_TOKEN_STORAGE_KEY)
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message

    return 'Unexpected GitHub authentication error'
}

export class GithubAuthService {
    private accessToken: string | null
    private activeDeviceCode: GithubDeviceCode | null
    private activeLoginId
    private readonly clearDelay
    private readonly config
    private readonly fetchUser
    private readonly listeners
    private pollingDelayId: DelayId | null
    private pollingIntervalSeconds
    private readonly requestAccessToken
    private readonly requestDeviceCode
    private readonly setDelay
    private snapshot
    private readonly storage

    constructor(dependencies: GithubAuthServiceDependencies) {
        this.accessToken = null
        this.activeDeviceCode = null
        this.activeLoginId = 0
        this.clearDelay = dependencies.clearDelay
        this.config = dependencies.config
        this.fetchUser = dependencies.fetchUser
        this.listeners = new Set<AuthListener>()
        this.pollingDelayId = null
        this.pollingIntervalSeconds = GITHUB_AUTH_POLLING_FALLBACK_SECONDS
        this.requestAccessToken = dependencies.requestAccessToken
        this.requestDeviceCode = dependencies.requestDeviceCode
        this.setDelay = dependencies.setDelay
        this.snapshot = INITIAL_AUTH_SNAPSHOT
        this.storage = dependencies.storage
    }

    getAccessToken() {
        return this.accessToken
    }

    getSnapshot() {
        return this.snapshot
    }

    subscribe(listener: AuthListener) {
        this.listeners.add(listener)

        return () => {
            this.listeners.delete(listener)
        }
    }

    async restoreSession() {
        const storedToken = getStoredAccessToken(this.storage)

        if (!storedToken) return

        this.accessToken = storedToken
        this.setSnapshot({ errorMessage: null, isAuthenticated: true, isLoadingUser: true, status: 'authenticated' })
        await this.loadCurrentUser(storedToken)
    }

    async login() {
        this.cancelPolling()
        this.activeLoginId += 1
        const loginId = this.activeLoginId
        this.activeDeviceCode = null
        this.pollingIntervalSeconds = GITHUB_AUTH_POLLING_FALLBACK_SECONDS
        this.setSnapshot({ deviceCode: null, errorMessage: null, status: 'requesting-code' })

        try {
            const deviceCode = await this.requestDeviceCode(this.config)

            if (loginId !== this.activeLoginId) return

            if (isOAuthError(deviceCode)) {
                this.setSnapshot({ errorMessage: buildAuthErrorMessage(deviceCode), status: 'error' })
                return
            }

            this.activeDeviceCode = deviceCode
            this.pollingIntervalSeconds = deviceCode.interval
            this.setSnapshot({ deviceCode, errorMessage: null, status: 'waiting' })
            this.scheduleTokenPoll(loginId, this.pollingIntervalSeconds)
        } catch (error) {
            this.setSnapshot({ errorMessage: getErrorMessage(error), status: 'error' })
        }
    }

    logout() {
        this.clearToken()
        this.cancelPolling()
        this.activeDeviceCode = null
        this.activeLoginId += 1
        this.setSnapshot({ ...INITIAL_AUTH_SNAPSHOT })
    }

    handleUnauthorized() {
        this.clearToken()
        this.cancelPolling()
        this.activeLoginId += 1
        this.setSnapshot({
            ...INITIAL_AUTH_SNAPSHOT,
            errorMessage: 'GitHub authorization expired. Sign in again.',
        })
    }

    private async loadCurrentUser(accessToken: string) {
        try {
            const user = await this.fetchUser(accessToken)

            this.setSnapshot({
                errorMessage: null,
                isAuthenticated: true,
                isLoadingUser: false,
                status: 'authenticated',
                user,
            })
        } catch (error) {
            if (error instanceof GithubUnauthorizedError) {
                this.handleUnauthorized()
                return
            }

            this.setSnapshot({
                errorMessage: getErrorMessage(error),
                isAuthenticated: true,
                isLoadingUser: false,
                status: 'authenticated',
            })
        }
    }

    private async pollAccessToken(loginId: number) {
        const deviceCode = this.activeDeviceCode

        if (!deviceCode || loginId !== this.activeLoginId) return

        try {
            const tokenResponse = await this.requestAccessToken(this.config, deviceCode.deviceCode)

            if (loginId !== this.activeLoginId) return

            if (isOAuthError(tokenResponse)) {
                this.handleTokenPollingError(loginId, tokenResponse)
                return
            }

            this.persistToken(tokenResponse.accessToken)
            this.setSnapshot({ errorMessage: null, isAuthenticated: true, isLoadingUser: true, status: 'authenticated' })
            await this.loadCurrentUser(tokenResponse.accessToken)
        } catch (error) {
            this.setSnapshot({ errorMessage: getErrorMessage(error), status: 'error' })
        }
    }

    private handleTokenPollingError(loginId: number, error: GithubOAuthErrorResponse) {
        if (error.error === 'authorization_pending') {
            this.scheduleTokenPoll(loginId, this.pollingIntervalSeconds)
            return
        }

        if (error.error === 'slow_down') {
            this.pollingIntervalSeconds += GITHUB_AUTH_SLOW_DOWN_SECONDS
            this.scheduleTokenPoll(loginId, this.pollingIntervalSeconds)
            return
        }

        if (error.error === 'expired_token') {
            this.cancelPolling()
            this.setSnapshot({ errorMessage: buildAuthErrorMessage(error), status: 'expired' })
            return
        }

        if (error.error === 'access_denied') {
            this.cancelPolling()
            this.setSnapshot({ errorMessage: buildAuthErrorMessage(error), status: 'denied' })
            return
        }

        this.cancelPolling()
        this.setSnapshot({ errorMessage: buildAuthErrorMessage(error), status: 'error' })
    }

    private scheduleTokenPoll(loginId: number, intervalSeconds: number) {
        this.cancelPolling()
        const delayMs = intervalSeconds * SECONDS_TO_MILLISECONDS
        this.pollingDelayId = this.setDelay(this.createTokenPollCallback(loginId), delayMs)
    }

    private createTokenPollCallback(loginId: number) {
        return () => {
            void this.pollAccessToken(loginId)
        }
    }

    private cancelPolling() {
        if (this.pollingDelayId === null) return

        this.clearDelay(this.pollingDelayId)
        this.pollingDelayId = null
    }

    private persistToken(accessToken: string) {
        this.accessToken = accessToken
        this.storage.setItem(AUTH_TOKEN_STORAGE_KEY, accessToken)
    }

    private clearToken() {
        this.accessToken = null
        this.storage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    }

    private setSnapshot(snapshot: Partial<AuthSnapshot>) {
        this.snapshot = { ...this.snapshot, ...snapshot }
        this.listeners.forEach(this.notifyListener, this)
    }

    private notifyListener(listener: AuthListener) {
        listener(this.snapshot)
    }
}

export function createGithubAuthService() {
    return new GithubAuthService({
        clearDelay: window.clearTimeout,
        config: readGithubAuthConfig(),
        fetchUser: fetchGithubUser,
        requestAccessToken: requestGithubAccessToken,
        requestDeviceCode: requestGithubDeviceCode,
        setDelay: window.setTimeout,
        storage: window.localStorage,
    })
}

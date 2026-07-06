import { readGithubAuthConfig, type GithubAuthConfig } from '../auth/github_auth_config'
import { fetchGithubUser, GithubUnauthorizedError } from '../auth/github_api_client'
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
} from '../auth/github_auth_types'
import { requestGithubAccessToken, requestGithubDeviceCode } from '../auth/github_oauth_transport'
import { configService } from './config_service'
import { register } from './service_injector'

type DelayId = ReturnType<typeof window.setTimeout>

export interface GithubAuthServiceDependencies {
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

export class GithubAuthService extends EventTarget {
    private accessToken: string | null
    private activeDeviceCode: GithubDeviceCode | null
    private activeLoginId
    private clearDelay: ((delayId: DelayId) => void) | null
    private config: GithubAuthConfig | null
    private fetchUser: ((accessToken: string) => Promise<GithubUser>) | null
    private pollingDelayId: DelayId | null
    private pollingIntervalSeconds
    private requestAccessToken: GithubAuthServiceDependencies['requestAccessToken'] | null
    private requestDeviceCode: GithubAuthServiceDependencies['requestDeviceCode'] | null
    private setDelay: ((callback: () => void, delayMs: number) => DelayId) | null
    private snapshot
    private storage: AuthStorage | null

    constructor() {
        super()
        this.accessToken = null
        this.activeDeviceCode = null
        this.activeLoginId = 0
        this.clearDelay = null
        this.config = null
        this.fetchUser = null
        this.pollingDelayId = null
        this.pollingIntervalSeconds = GITHUB_AUTH_POLLING_FALLBACK_SECONDS
        this.requestAccessToken = null
        this.requestDeviceCode = null
        this.setDelay = null
        this.snapshot = INITIAL_AUTH_SNAPSHOT
        this.storage = null
        register('githubAuthService', this)
    }

    init(dependencies: GithubAuthServiceDependencies) {
        this.accessToken = null
        this.activeDeviceCode = null
        this.activeLoginId = 0
        this.clearDelay = dependencies.clearDelay
        this.config = dependencies.config
        this.fetchUser = dependencies.fetchUser
        this.pollingDelayId = null
        this.pollingIntervalSeconds = GITHUB_AUTH_POLLING_FALLBACK_SECONDS
        this.requestAccessToken = dependencies.requestAccessToken
        this.requestDeviceCode = dependencies.requestDeviceCode
        this.setDelay = dependencies.setDelay
        this.snapshot = INITIAL_AUTH_SNAPSHOT
        this.storage = dependencies.storage
        this.dispatchChanged()
    }

    getAccessToken() {
        return this.accessToken
    }

    getSnapshot() {
        return this.snapshot
    }

    isInitialized() {
        return !!this.config
    }

    async restoreSession() {
        const { storage } = this.requireDependencies()
        const storedToken = getStoredAccessToken(storage)

        if (!storedToken) return

        this.accessToken = storedToken
        this.setSnapshot({ errorMessage: null, isAuthenticated: true, isLoadingUser: true, status: 'authenticated' })
        await this.loadCurrentUser(storedToken)
    }

    async login() {
        const { config, requestDeviceCode } = this.requireDependencies()
        this.cancelPolling()
        this.activeLoginId += 1
        const loginId = this.activeLoginId
        this.activeDeviceCode = null
        this.pollingIntervalSeconds = GITHUB_AUTH_POLLING_FALLBACK_SECONDS
        this.setSnapshot({ deviceCode: null, errorMessage: null, status: 'requesting-code' })

        try {
            const deviceCode = await requestDeviceCode({ ...config, scopes: this.resolveScopes(config.scopes) })

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
        const { fetchUser } = this.requireDependencies()

        try {
            const user = await fetchUser(accessToken)

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
        const { config, requestAccessToken } = this.requireDependencies()
        const deviceCode = this.activeDeviceCode

        if (!deviceCode || loginId !== this.activeLoginId) return

        try {
            const tokenResponse = await requestAccessToken(config, deviceCode.deviceCode)

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
        const { setDelay } = this.requireDependencies()
        this.cancelPolling()
        const delayMs = intervalSeconds * SECONDS_TO_MILLISECONDS
        this.pollingDelayId = setDelay(this.createTokenPollCallback(loginId), delayMs)
    }

    private createTokenPollCallback(loginId: number) {
        return () => {
            void this.pollAccessToken(loginId)
        }
    }

    private cancelPolling() {
        const { clearDelay } = this.requireDependencies()
        if (this.pollingDelayId === null) return

        clearDelay(this.pollingDelayId)
        this.pollingDelayId = null
    }

    private resolveScopes(fallbackScopes: string): string {
        if (!configService.isInitialized()) return fallbackScopes

        const scopes = configService.get('connection.githubScopes')

        return typeof scopes === 'string' ? scopes : fallbackScopes
    }

    private persistToken(accessToken: string) {
        const { storage } = this.requireDependencies()
        this.accessToken = accessToken
        storage.setItem(AUTH_TOKEN_STORAGE_KEY, accessToken)
    }

    private clearToken() {
        const { storage } = this.requireDependencies()
        this.accessToken = null
        storage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    }

    private setSnapshot(snapshot: Partial<AuthSnapshot>) {
        this.snapshot = { ...this.snapshot, ...snapshot }
        this.dispatchChanged()
    }

    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent<AuthSnapshot>('changed', { detail: this.snapshot }))
    }

    private requireDependencies() {
        if (!this.clearDelay) throw new Error('GitHub auth service delay clearing is not initialized')
        if (!this.config) throw new Error('GitHub auth service config is not initialized')
        if (!this.fetchUser) throw new Error('GitHub auth service user fetcher is not initialized')
        if (!this.requestAccessToken) throw new Error('GitHub auth service access token request is not initialized')
        if (!this.requestDeviceCode) throw new Error('GitHub auth service device code request is not initialized')
        if (!this.setDelay) throw new Error('GitHub auth service delay scheduling is not initialized')
        if (!this.storage) throw new Error('GitHub auth service storage is not initialized')

        return {
            clearDelay: this.clearDelay,
            config: this.config,
            fetchUser: this.fetchUser,
            requestAccessToken: this.requestAccessToken,
            requestDeviceCode: this.requestDeviceCode,
            setDelay: this.setDelay,
            storage: this.storage,
        }
    }
}

export function createGithubAuthService() {
    const service = new GithubAuthService()

    return initDefaultGithubAuthService(service)
}

export function initDefaultGithubAuthService(service: GithubAuthService) {
    service.init({
        clearDelay: window.clearTimeout,
        config: readGithubAuthConfig(),
        fetchUser: fetchGithubUser,
        requestAccessToken: requestGithubAccessToken,
        requestDeviceCode: requestGithubDeviceCode,
        setDelay: window.setTimeout,
        storage: window.localStorage,
    })

    return service
}

export const githubAuthService = new GithubAuthService()

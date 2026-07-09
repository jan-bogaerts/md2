import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { configService } from '../services/config_service'
import { GithubAuthService, type GithubAuthServiceDependencies } from '../services/github_auth_service'
import { GithubUnauthorizedError } from './github_api_client'
import { AUTH_METHOD_STORAGE_KEY, AUTH_TOKEN_STORAGE_KEY, type AuthStorage, type GithubDeviceCode, type GithubUser } from './github_auth_types'

const config = {
    clientId: 'client-id',
    oauthProxyUrl: 'https://proxy.example.test',
    scopes: 'repo',
}

const deviceCode: GithubDeviceCode = {
    deviceCode: 'device-code',
    expiresIn: 900,
    interval: 1,
    userCode: 'ABCD-1234',
    verificationUri: 'https://github.com/login/device',
}

const githubUser: GithubUser = {
    avatarUrl: null,
    htmlUrl: 'https://github.com/jb',
    id: 1,
    login: 'jb',
    name: 'JB',
}

function createMemoryStorage(initialToken: string | null = null, initialMethod: string | null = null): AuthStorage {
    const items = new Map<string, string>()

    if (initialToken) items.set(AUTH_TOKEN_STORAGE_KEY, initialToken)
    if (initialMethod) items.set(AUTH_METHOD_STORAGE_KEY, initialMethod)

    return {
        getItem: (key) => items.get(key) ?? null,
        removeItem: (key) => {
            items.delete(key)
        },
        setItem: (key, value) => {
            items.set(key, value)
        },
    }
}

function createService(overrides: Partial<GithubAuthServiceDependencies> = {}) {
    const storage = createMemoryStorage()
    const dependencies = {
        clearDelay: window.clearTimeout,
        config,
        fetchUser: vi.fn().mockResolvedValue(githubUser),
        requestAccessToken: vi.fn().mockResolvedValue({ accessToken: 'token', scope: 'repo', tokenType: 'bearer' }),
        requestDeviceCode: vi.fn().mockResolvedValue(deviceCode),
        setDelay: window.setTimeout,
        storage,
        ...overrides,
    }

    const service = new GithubAuthService()
    service.init(dependencies)

    return { dependencies, service, storage }
}

describe('GithubAuthService', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        configService.clear()
    })

    it('persists a successful device-flow token and loads the current user', async () => {
        const { dependencies, service, storage } = createService()

        await service.login()
        await vi.advanceTimersByTimeAsync(1000)

        expect(dependencies.requestDeviceCode).toHaveBeenCalledWith(config)
        expect(dependencies.requestAccessToken).toHaveBeenCalledWith(config, 'device-code')
        expect(storage.getItem(AUTH_METHOD_STORAGE_KEY)).toBe('device')
        expect(storage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('token')
        expect(service.getSnapshot()).toMatchObject({
            authMethod: 'device',
            isAuthenticated: true,
            status: 'authenticated',
            user: githubUser,
        })
    })

    it('falls back to the configured scopes when configService is not initialized', async () => {
        const { dependencies, service } = createService()

        await service.login()
        await vi.advanceTimersByTimeAsync(1000)

        expect(dependencies.requestDeviceCode).toHaveBeenCalledWith({ ...config, scopes: 'repo' })
    })

    it('uses the connection.githubScopes config value when requesting the device code', async () => {
        configService.init()
        configService.set('connection.githubScopes', 'public_repo')
        const { dependencies, service } = createService()

        await service.login()
        await vi.advanceTimersByTimeAsync(1000)

        expect(dependencies.requestDeviceCode).toHaveBeenCalledWith({ ...config, scopes: 'public_repo' })
    })

    it('does not start device-flow login without a GitHub client id', async () => {
        const { dependencies, service } = createService({ config: { ...config, clientId: null } })

        await service.login()

        expect(dependencies.requestDeviceCode).not.toHaveBeenCalled()
        expect(service.getSnapshot()).toMatchObject({
            errorMessage: 'Missing required GitHub auth config: GITHUB_CLIENT_ID',
            status: 'error',
        })
    })

    it('respects pending and slow-down polling states before token success', async () => {
        const requestAccessToken = vi.fn()
            .mockResolvedValueOnce({ error: 'authorization_pending' })
            .mockResolvedValueOnce({ error: 'slow_down' })
            .mockResolvedValueOnce({ accessToken: 'token', scope: 'repo', tokenType: 'bearer' })
        const { service } = createService({ requestAccessToken })

        await service.login()
        await vi.advanceTimersByTimeAsync(1000)
        await vi.advanceTimersByTimeAsync(1000)
        await vi.advanceTimersByTimeAsync(5000)

        expect(requestAccessToken).toHaveBeenCalledTimes(2)

        await vi.advanceTimersByTimeAsync(1000)

        expect(requestAccessToken).toHaveBeenCalledTimes(3)
        expect(service.getSnapshot().isAuthenticated).toBe(true)
    })

    it('surfaces expired device codes without hanging', async () => {
        const requestAccessToken = vi.fn().mockResolvedValue({ error: 'expired_token', errorDescription: 'Code expired' })
        const { service } = createService({ requestAccessToken })

        await service.login()
        await vi.advanceTimersByTimeAsync(1000)

        expect(service.getSnapshot()).toMatchObject({
            errorMessage: 'Code expired',
            status: 'expired',
        })
    })

    it('restores a persisted token on startup', async () => {
        const storage = createMemoryStorage('stored-token', 'device')
        const { dependencies, service } = createService({ storage })

        await service.restoreSession()

        expect(dependencies.fetchUser).toHaveBeenCalledWith('stored-token')
        expect(service.getAccessToken()).toBe('stored-token')
        expect(service.getSnapshot().authMethod).toBe('device')
        expect(service.getSnapshot().user).toEqual(githubUser)
    })

    it('validates and persists a personal access token', async () => {
        const { dependencies, service, storage } = createService()

        await service.savePersonalAccessToken(' pat-token ')

        expect(dependencies.fetchUser).toHaveBeenCalledWith('pat-token')
        expect(storage.getItem(AUTH_METHOD_STORAGE_KEY)).toBe('pat')
        expect(storage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('pat-token')
        expect(service.getSnapshot()).toMatchObject({
            authMethod: 'pat',
            isAuthenticated: true,
            user: githubUser,
        })
    })

    it('rejects an invalid personal access token without persisting it', async () => {
        const fetchUser = vi.fn().mockRejectedValue(new GithubUnauthorizedError())
        const { service, storage } = createService({ fetchUser })

        await service.savePersonalAccessToken('bad-token')

        expect(storage.getItem(AUTH_METHOD_STORAGE_KEY)).toBeNull()
        expect(storage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
        expect(service.getSnapshot()).toMatchObject({
            errorMessage: 'GitHub access token is no longer authorized',
            isAuthenticated: false,
        })
    })

    it('restores a persisted personal access token auth method on startup', async () => {
        const storage = createMemoryStorage('stored-token', 'pat')
        const { service } = createService({ storage })

        await service.restoreSession()

        expect(service.getSnapshot()).toMatchObject({
            authMethod: 'pat',
            isAuthenticated: true,
            user: githubUser,
        })
    })

    it('clears persisted auth on logout', async () => {
        const { service, storage } = createService()

        await service.login()
        await vi.advanceTimersByTimeAsync(1000)
        service.logout()

        expect(storage.getItem(AUTH_METHOD_STORAGE_KEY)).toBeNull()
        expect(storage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
        expect(service.getSnapshot().isAuthenticated).toBe(false)
    })

    it('clears auth when GitHub returns 401 while loading the user', async () => {
        const storage = createMemoryStorage('stored-token', 'pat')
        const fetchUser = vi.fn().mockRejectedValue(new GithubUnauthorizedError())
        const { service } = createService({ fetchUser, storage })

        await service.restoreSession()

        expect(storage.getItem(AUTH_METHOD_STORAGE_KEY)).toBeNull()
        expect(storage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
        expect(service.getSnapshot()).toMatchObject({
            errorMessage: 'GitHub authorization expired. Sign in again.',
            authMethod: null,
            isAuthenticated: false,
        })
    })
})

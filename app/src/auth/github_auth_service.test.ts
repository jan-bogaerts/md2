import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { GithubAuthService, type GithubAuthServiceDependencies } from '../services/github_auth_service'
import { GithubUnauthorizedError } from './github_api_client'
import { AUTH_TOKEN_STORAGE_KEY, type AuthStorage, type GithubDeviceCode, type GithubUser } from './github_auth_types'

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

function createMemoryStorage(initialToken: string | null = null): AuthStorage {
    const items = new Map<string, string>()

    if (initialToken) items.set(AUTH_TOKEN_STORAGE_KEY, initialToken)

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
    })

    it('persists a successful device-flow token and loads the current user', async () => {
        const { dependencies, service, storage } = createService()

        await service.login()
        await vi.advanceTimersByTimeAsync(1000)

        expect(dependencies.requestDeviceCode).toHaveBeenCalledWith(config)
        expect(dependencies.requestAccessToken).toHaveBeenCalledWith(config, 'device-code')
        expect(storage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('token')
        expect(service.getSnapshot()).toMatchObject({
            isAuthenticated: true,
            status: 'authenticated',
            user: githubUser,
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
        const storage = createMemoryStorage('stored-token')
        const { dependencies, service } = createService({ storage })

        await service.restoreSession()

        expect(dependencies.fetchUser).toHaveBeenCalledWith('stored-token')
        expect(service.getAccessToken()).toBe('stored-token')
        expect(service.getSnapshot().user).toEqual(githubUser)
    })

    it('clears persisted auth on logout', async () => {
        const { service, storage } = createService()

        await service.login()
        await vi.advanceTimersByTimeAsync(1000)
        service.logout()

        expect(storage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
        expect(service.getSnapshot().isAuthenticated).toBe(false)
    })

    it('clears auth when GitHub returns 401 while loading the user', async () => {
        const storage = createMemoryStorage('stored-token')
        const fetchUser = vi.fn().mockRejectedValue(new GithubUnauthorizedError())
        const { service } = createService({ fetchUser, storage })

        await service.restoreSession()

        expect(storage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
        expect(service.getSnapshot()).toMatchObject({
            errorMessage: 'GitHub authorization expired. Sign in again.',
            isAuthenticated: false,
        })
    })
})

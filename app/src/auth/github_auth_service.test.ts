import { describe, expect, it, vi } from 'vitest'
import { GithubAuthService, type GithubAuthServiceDependencies } from '../services/github_auth_service'
import { GithubUnauthorizedError } from './github_api_client'
import { AUTH_TOKEN_STORAGE_KEY, type AuthStorage, type GithubUser } from './github_auth_types'

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
        fetchUser: vi.fn().mockResolvedValue(githubUser),
        storage,
        ...overrides,
    }

    const service = new GithubAuthService()
    service.init(dependencies)

    return { dependencies, service, storage }
}

describe('GithubAuthService', () => {
    it('validates and persists a personal access token', async () => {
        const { dependencies, service, storage } = createService()

        await service.savePersonalAccessToken(' pat-token ')

        expect(dependencies.fetchUser).toHaveBeenCalledWith('pat-token')
        expect(storage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('pat-token')
        expect(service.getAccessToken()).toBe('pat-token')
        expect(service.getSnapshot()).toMatchObject({
            isAuthenticated: true,
            status: 'authenticated',
            user: githubUser,
        })
    })

    it('rejects an invalid personal access token without persisting it', async () => {
        const fetchUser = vi.fn().mockRejectedValue(new GithubUnauthorizedError())
        const { service, storage } = createService({ fetchUser })

        await service.savePersonalAccessToken('bad-token')

        expect(storage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull()
        expect(service.getSnapshot()).toMatchObject({
            errorMessage: 'GitHub access token is no longer authorized',
            isAuthenticated: false,
        })
    })

    it('restores a persisted token on startup', async () => {
        const storage = createMemoryStorage('stored-token')
        const { dependencies, service } = createService({ storage })

        await service.restoreSession()

        expect(dependencies.fetchUser).toHaveBeenCalledWith('stored-token')
        expect(service.getAccessToken()).toBe('stored-token')
        expect(service.getSnapshot()).toMatchObject({
            isAuthenticated: true,
            status: 'authenticated',
            user: githubUser,
        })
    })

    it('clears persisted auth on logout', async () => {
        const { service, storage } = createService()

        await service.savePersonalAccessToken('pat-token')
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

import { fetchGithubUser, GithubUnauthorizedError } from '../auth/github_api_client'
import {
    AUTH_TOKEN_STORAGE_KEY,
    type AuthSnapshot,
    type AuthStorage,
    type GithubUser,
} from '../auth/github_auth_types'
import { register } from './service_injector'

export interface GithubAuthServiceDependencies {
    fetchUser: (accessToken: string) => Promise<GithubUser>
    storage: AuthStorage
}

const INITIAL_AUTH_SNAPSHOT: AuthSnapshot = {
    errorMessage: null,
    isAuthenticated: false,
    isLoadingUser: false,
    status: 'idle',
    user: null,
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
    private fetchUser: ((accessToken: string) => Promise<GithubUser>) | null
    private initialized: boolean
    private snapshot
    private storage: AuthStorage | null

    constructor() {
        super()
        this.accessToken = null
        this.fetchUser = null
        this.initialized = false
        this.snapshot = INITIAL_AUTH_SNAPSHOT
        this.storage = null
        register('githubAuthService', this)
    }

    init(dependencies: GithubAuthServiceDependencies) {
        this.accessToken = null
        this.fetchUser = dependencies.fetchUser
        this.initialized = true
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
        return this.initialized
    }

    async restoreSession() {
        const { storage } = this.requireDependencies()
        const storedToken = getStoredAccessToken(storage)

        if (!storedToken) return

        this.accessToken = storedToken
        this.setSnapshot({ errorMessage: null, isAuthenticated: true, isLoadingUser: true, status: 'authenticated' })
        await this.loadCurrentUser(storedToken)
    }

    logout() {
        this.clearToken()
        this.setSnapshot({ ...INITIAL_AUTH_SNAPSHOT })
    }

    async savePersonalAccessToken(accessToken: string) {
        const personalAccessToken = accessToken.trim()
        const { fetchUser } = this.requireDependencies()

        this.setSnapshot({ errorMessage: null, isLoadingUser: true, status: 'idle' })

        try {
            const user = await fetchUser(personalAccessToken)

            this.persistToken(personalAccessToken)
            this.setSnapshot({
                errorMessage: null,
                isAuthenticated: true,
                isLoadingUser: false,
                status: 'authenticated',
                user,
            })
        } catch (error) {
            this.setSnapshot({
                errorMessage: getErrorMessage(error),
                isAuthenticated: false,
                isLoadingUser: false,
                status: 'idle',
                user: null,
            })
        }
    }

    handleUnauthorized() {
        this.clearToken()
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
        if (!this.fetchUser) throw new Error('GitHub auth service user fetcher is not initialized')
        if (!this.storage) throw new Error('GitHub auth service storage is not initialized')

        return {
            fetchUser: this.fetchUser,
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
        fetchUser: fetchGithubUser,
        storage: window.localStorage,
    })

    return service
}

export const githubAuthService = new GithubAuthService()

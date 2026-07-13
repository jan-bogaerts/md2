export const AUTH_TOKEN_STORAGE_KEY = 'md2.github.accessToken'
export const GITHUB_USER_URL = 'https://api.github.com/user'

export type GithubAuthStatus = 'idle' | 'authenticated' | 'error'

export interface GithubUser {
    avatarUrl: string | null
    htmlUrl: string
    id: number
    login: string
    name: string | null
}

export interface AuthSnapshot {
    errorMessage: string | null
    isAuthenticated: boolean
    isLoadingUser: boolean
    status: GithubAuthStatus
    user: GithubUser | null
}

export interface AuthStorage {
    getItem(key: string): string | null
    removeItem(key: string): void
    setItem(key: string, value: string): void
}

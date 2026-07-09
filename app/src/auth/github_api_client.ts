import { GITHUB_USER_URL, type GithubUser } from './github_auth_types'

const GITHUB_API_URL = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'

interface GithubUserApiResponse {
    avatar_url?: unknown
    html_url?: unknown
    id?: unknown
    login?: unknown
    name?: unknown
}

export class GithubUnauthorizedError extends Error {
    constructor() {
        super('GitHub access token is no longer authorized')
    }
}

export interface GithubApiClientDependencies {
    accessToken: string
    fetchImplementation?: typeof fetch
    onUnauthorized?: () => void
}

function getDefaultFetchImplementation() {
    return globalThis.fetch.bind(globalThis)
}

export class GithubApiClient {
    private readonly accessToken: string
    private readonly fetchImplementation: typeof fetch
    private readonly onUnauthorized: (() => void) | null

    constructor(dependencies: GithubApiClientDependencies) {
        this.accessToken = dependencies.accessToken
        this.fetchImplementation = dependencies.fetchImplementation ?? getDefaultFetchImplementation()
        this.onUnauthorized = dependencies.onUnauthorized ?? null
    }

    async requestJson(path: string, init: RequestInit = {}, allowNotFound = false) {
        const response = await this.fetchImplementation(`${GITHUB_API_URL}${path}`, {
            ...init,
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': GITHUB_API_VERSION,
                ...init.headers,
            },
        })

        if (allowNotFound && response.status === 404) return null
        this.assertSuccessfulResponse(response, init)

        return response.json()
    }

    async requestText(path: string, init: RequestInit = {}) {
        const response = await this.fetchImplementation(`${GITHUB_API_URL}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'X-GitHub-Api-Version': GITHUB_API_VERSION,
                ...init.headers,
            },
        })

        this.assertSuccessfulResponse(response, init)

        return response.text()
    }

    private assertSuccessfulResponse(response: Response, init: RequestInit) {
        if ((init.method === 'PATCH' || init.method === 'PUT') && (response.status === 409 || response.status === 422)) {
            throw new Error('The file changed remotely. Reload or refresh the project before saving again.')
        }
        if (response.status === 401) {
            this.onUnauthorized?.()
            throw new GithubUnauthorizedError()
        }
        if (!response.ok) throw new Error(`GitHub storage request failed with status ${response.status}`)
    }
}

function requireString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing GitHub user field: ${fieldName}`)

    return value
}

function requireNumber(value: unknown, fieldName: string) {
    if (typeof value !== 'number') throw new Error(`Missing GitHub user field: ${fieldName}`)

    return value
}

function normalizeGithubUser(payload: unknown): GithubUser {
    const response = payload as GithubUserApiResponse
    const avatarUrl = response.avatar_url
    const name = response.name

    return {
        avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
        htmlUrl: requireString(response.html_url, 'html_url'),
        id: requireNumber(response.id, 'id'),
        login: requireString(response.login, 'login'),
        name: typeof name === 'string' ? name : null,
    }
}

export async function fetchGithubUser(accessToken: string) {
    const response = await fetch(GITHUB_USER_URL, {
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${accessToken}`,
        },
    })

    if (response.status === 401) throw new GithubUnauthorizedError()
    if (!response.ok) throw new Error(`GitHub user request failed with status ${response.status}`)

    return normalizeGithubUser(await response.json())
}

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

interface GithubErrorResponse {
    message?: unknown
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
        await this.assertSuccessfulResponse(path, response, init)

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

        await this.assertSuccessfulResponse(path, response, init)

        return response.text()
    }

    private async assertSuccessfulResponse(path: string, response: Response, init: RequestInit) {
        if ((init.method === 'PATCH' || init.method === 'PUT') && (response.status === 409 || response.status === 422)) {
            throw new Error('The file changed remotely. Reload or refresh the project before saving again.')
        }
        if (response.status === 401) {
            this.onUnauthorized?.()
            throw new GithubUnauthorizedError()
        }
        if (!response.ok) throw new Error(await buildGithubStorageErrorMessage(path, response, init))
    }
}

function githubRequestLabel(path: string, init: RequestInit) {
    return `${init.method ?? 'GET'} ${path}`
}

async function readGithubErrorMessage(response: Response): Promise<string | null> {
    try {
        const errorResponse = await response.clone().json() as GithubErrorResponse
        if (typeof errorResponse.message === 'string' && errorResponse.message.length > 0) return errorResponse.message
    } catch {
        return null
    }

    return null
}

function isWriteRequest(init: RequestInit) {
    return init.method === 'DELETE' || init.method === 'PATCH' || init.method === 'POST' || init.method === 'PUT'
}

async function buildGithubStorageErrorMessage(path: string, response: Response, init: RequestInit) {
    const detail = await readGithubErrorMessage(response)
    const requestLabel = githubRequestLabel(path, init)
    const baseMessage = `GitHub storage request failed with status ${response.status} for ${requestLabel}`
    const detailMessage = detail ? `${baseMessage}: ${detail}` : baseMessage
    if (response.status !== 403) return detailMessage
    if (!isWriteRequest(init)) return `${detailMessage}. Check that the token can access this repository.`

    return `${detailMessage}. Check that the token has Contents read/write access, repository write access, and permission to push to this branch.`
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

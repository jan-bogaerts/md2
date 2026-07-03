import { GITHUB_USER_URL, type GithubUser } from './githubAuthTypes'

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

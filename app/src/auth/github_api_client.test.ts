import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGithubUser, GithubApiClient, GithubUnauthorizedError } from './github_api_client'

describe('GithubApiClient', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('binds the default fetch implementation to the global object', async () => {
        function fetchImplementation(this: unknown) {
            if (this !== globalThis) throw new TypeError('Illegal invocation')

            return Promise.resolve({
                json: async () => ({ id: 1 }),
                ok: true,
                status: 200,
            })
        }

        vi.stubGlobal('fetch', fetchImplementation)

        const client = new GithubApiClient({ accessToken: 'token' })

        await expect(client.requestJson('/user')).resolves.toEqual({ id: 1 })
    })

    it('includes the GitHub error detail and request target for forbidden write failures', async () => {
        const fetchImplementation = vi.fn().mockResolvedValue(new Response(
            JSON.stringify({ message: 'Resource not accessible by personal access token' }),
            { status: 403 },
        ))
        const client = new GithubApiClient({ accessToken: 'token', fetchImplementation })

        await expect(client.requestJson('/repos/owner/repo/git/refs/heads/main', {
            body: JSON.stringify({ sha: 'commit' }),
            method: 'PATCH',
        })).rejects.toThrow(
            'GitHub storage request failed with status 403 for PATCH /repos/owner/repo/git/refs/heads/main: Resource not accessible by personal access token. Check that the token has Contents read/write access, repository write access, and permission to push to this branch.',
        )
    })
})

describe('fetchGithubUser', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('normalizes the GitHub user response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            json: async () => ({
                avatar_url: null,
                html_url: 'https://github.com/jb',
                id: 1,
                login: 'jb',
                name: 'JB',
            }),
            ok: true,
            status: 200,
        }))

        await expect(fetchGithubUser('token')).resolves.toEqual({
            avatarUrl: null,
            htmlUrl: 'https://github.com/jb',
            id: 1,
            login: 'jb',
            name: 'JB',
        })
    })

    it('throws a typed unauthorized error for 401 responses', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            json: async () => ({}),
            ok: false,
            status: 401,
        }))

        await expect(fetchGithubUser('token')).rejects.toBeInstanceOf(GithubUnauthorizedError)
    })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGithubUser, GithubUnauthorizedError } from './githubApiClient'

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

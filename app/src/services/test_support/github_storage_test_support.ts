import { vi } from 'vitest'

export const project = { branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }
export const EXPECTED_GITHUB_CONCURRENCY_LIMIT = 8
export const GITHUB_CONCURRENCY_TEST_FILE_COUNT = 10

export function createResponse(payload: unknown) {
    return {
        json: async () => payload,
        ok: true,
        status: 200,
    } as Response
}

export function createRawResponse(content: string) {
    return {
        ok: true,
        status: 200,
        text: async () => content,
    } as Response
}

export function createStatusResponse(status: number) {
    return {
        json: async () => ({}),
        ok: status >= 200 && status < 300,
        status,
    } as Response
}

export function queueProjectTree(fetchImplementation: ReturnType<typeof vi.fn>, entries: unknown[], treeSha = 'base-tree') {
    fetchImplementation
        .mockResolvedValueOnce(createResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' }))
        .mockResolvedValueOnce(createResponse({ sha: 'base-commit', tree: { sha: treeSha } }))
        .mockResolvedValueOnce(createResponse({ tree: entries, truncated: false }))
}

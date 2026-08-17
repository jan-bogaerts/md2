import { afterEach, describe, expect, it, vi } from 'vitest'
import { SentryApiClient, SentryApiError, type SentryApiRequest } from './sentry_api_client'

const request: SentryApiRequest = {
    apiBaseUrl: 'https://sentry.example.com/',
    apiToken: 'secret-token',
    environment: 'production',
    organization: 'acme',
    project: 'frontend',
}

describe('SentryApiClient', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('keeps globalThis as receiver for default browser fetch', async () => {
        const fetchRequest = vi.fn(async function receiverSensitiveFetch(this: typeof globalThis) {
            if (this !== globalThis) throw new TypeError('Illegal invocation')

            return new Response('{}')
        })
        vi.stubGlobal('fetch', fetchRequest)
        const client = new SentryApiClient()

        await client.validateProject(request)

        expect(fetchRequest).toHaveBeenCalledWith(
            'https://sentry.example.com/api/0/projects/acme/frontend/',
            { headers: { Accept: 'application/json', Authorization: 'Bearer secret-token' } },
        )
    })

    it('validates configured organization and project with bearer authentication', async () => {
        const fetchRequest = vi.fn(async () => new Response('{}'))
        const client = new SentryApiClient({ fetch: fetchRequest })

        await client.validateProject(request)

        expect(fetchRequest).toHaveBeenCalledWith(
            'https://sentry.example.com/api/0/projects/acme/frontend/',
            { headers: { Accept: 'application/json', Authorization: 'Bearer secret-token' } },
        )
    })

    it('loads every unresolved environment page through Sentry cursor links', async () => {
        const firstHeaders = new Headers({Link: '<https://sentry.example.com/api/0/projects/acme/frontend/issues/?cursor=next>; rel="next"; results="true"'})
        const fetchRequest = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '1', title: 'First' }]), { headers: firstHeaders }))
            .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '2', title: 'Second' }])))
        const client = new SentryApiClient({ fetch: fetchRequest })

        const issues = await client.listUnresolvedIssues(request)

        const firstUrl = new URL(fetchRequest.mock.calls[0][0] as string)
        expect(firstUrl.pathname).toBe('/api/0/projects/acme/frontend/issues/')
        expect(firstUrl.searchParams.get('query')).toBe('is:unresolved environment:"production"')
        expect(firstUrl.searchParams.get('limit')).toBe('100')
        expect(fetchRequest.mock.calls[1][0]).toContain('cursor=next')
        expect(issues.map(({ id }) => id)).toEqual(['1', '2'])
    })

    it('loads and sanitizes the recommended event', async () => {
        const event = {
            entries: [{
                data: {
                    values: [{
                        stacktrace: {
                            frames: [
                                { filename: 'vendor.js', function: 'vendor', inApp: false, vars: { token: 'secret' } },
                                { colNo: 4, filename: 'app.ts', function: 'run', inApp: true, lineNo: 12, vars: { token: 'secret' } },
                            ],
                        },
                    }],
                },
                type: 'exception',
            }],
            eventID: 'event-1',
            message: 'Failed',
            release: { version: '1.2.3' },
            request: { cookies: [['session', 'secret']], data: 'secret body' },
            tags: [{ key: 'environment', value: 'production' }],
            user: { email: 'person@example.com' },
        }
        const fetchRequest = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(event)))
        const client = new SentryApiClient({ fetch: fetchRequest })

        const result = await client.loadRecommendedEvent(request, '123')

        expect(fetchRequest.mock.calls[0][0]).toContain('/api/0/organizations/acme/issues/123/events/recommended/')
        expect(result).toEqual({
            environment: 'production',
            eventId: 'event-1',
            message: 'Failed',
            release: '1.2.3',
            stackFrames: [{ columnNumber: 4, fileName: 'app.ts', functionName: 'run', lineNumber: 12 }],
        })
        expect(JSON.stringify(result)).not.toContain('secret')
        expect(JSON.stringify(result)).not.toContain('person@example.com')
    })

    it('tolerates malformed optional event fields', async () => {
        const fetchRequest = vi.fn(async () => new Response(JSON.stringify({ entries: 'bad', eventID: 'event-1', release: 12 })))
        const client = new SentryApiClient({ fetch: fetchRequest })

        await expect(client.loadRecommendedEvent(request, '123')).resolves.toEqual({
            environment: null,
            eventId: 'event-1',
            message: null,
            release: null,
            stackFrames: [],
        })
    })

    it('reports rate limits with retry timing', async () => {
        const fetchRequest = vi.fn(async () => new Response('', { headers: { 'Retry-After': '30' }, status: 429 }))
        const client = new SentryApiClient({ fetch: fetchRequest })

        await expect(client.listUnresolvedIssues(request)).rejects.toEqual(
            new SentryApiError('Sentry request failed with status 429. Retry after 30 seconds.', 429),
        )
    })
})

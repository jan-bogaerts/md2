import type { SentryIssueEvent, SentryIssueSummary, SentryStackFrame } from './sentry_types'
import { normalizeSentryBaseUrl } from './sentry_types'

export interface SentryApiRequest {
    apiBaseUrl: string
    apiToken: string
    environment: string
    organization: string
    project: string
}

export interface SentryApiClientDependencies {
    fetch: typeof fetch
}

export class SentryApiError extends Error {
    readonly status: number

    constructor(message: string, status: number) {
        super(message)
        this.name = 'SentryApiError'
        this.status = status
    }
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed Sentry ${context}`)

    return value as Record<string, unknown>
}

function optionalString(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : null
}

function optionalNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function issueSummary(value: unknown): SentryIssueSummary {
    const issue = requireRecord(value, 'issue response')
    const id = optionalString(issue.id)
    const title = optionalString(issue.title)
    if (!id) throw new Error('Malformed Sentry issue response: id is required')
    if (!title) throw new Error(`Malformed Sentry issue response for ${id}: title is required`)

    return {
        count: optionalString(issue.count),
        culprit: optionalString(issue.culprit),
        firstSeen: optionalString(issue.firstSeen),
        id,
        lastSeen: optionalString(issue.lastSeen),
        link: optionalString(issue.permalink),
        title,
    }
}

function stackFrames(entries: unknown): SentryStackFrame[] {
    if (!Array.isArray(entries)) return []

    return entries.flatMap((entryValue) => {
        if (!entryValue || typeof entryValue !== 'object' || Array.isArray(entryValue)) return []
        const entry = entryValue as Record<string, unknown>
        if (entry.type !== 'exception') return []
        const data = entry.data
        if (!data || typeof data !== 'object' || Array.isArray(data)) return []
        const values = (data as Record<string, unknown>).values
        if (!Array.isArray(values)) return []

        return values.flatMap((exceptionValue) => {
            if (!exceptionValue || typeof exceptionValue !== 'object' || Array.isArray(exceptionValue)) return []
            const stacktrace = (exceptionValue as Record<string, unknown>).stacktrace
            if (!stacktrace || typeof stacktrace !== 'object' || Array.isArray(stacktrace)) return []
            const frames = (stacktrace as Record<string, unknown>).frames
            if (!Array.isArray(frames)) return []

            return frames.flatMap((frameValue) => {
                if (!frameValue || typeof frameValue !== 'object' || Array.isArray(frameValue)) return []
                const frame = frameValue as Record<string, unknown>
                if (frame.inApp !== true) return []

                return [{
                    columnNumber: optionalNumber(frame.colNo),
                    fileName: optionalString(frame.filename),
                    functionName: optionalString(frame.function),
                    lineNumber: optionalNumber(frame.lineNo),
                }]
            })
        })
    })
}

function releaseVersion(value: unknown) {
    if (typeof value === 'string') return optionalString(value)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null

    return optionalString((value as Record<string, unknown>).version)
}

function eventEnvironment(event: Record<string, unknown>) {
    const directEnvironment = optionalString(event.environment)
    if (directEnvironment) return directEnvironment
    if (!Array.isArray(event.tags)) return null

    const environmentTag = event.tags.find((tagValue) => {
        if (!tagValue || typeof tagValue !== 'object' || Array.isArray(tagValue)) return false
        return (tagValue as Record<string, unknown>).key === 'environment'
    }) as Record<string, unknown> | undefined

    return optionalString(environmentTag?.value)
}

function issueEvent(value: unknown): SentryIssueEvent {
    const event = requireRecord(value, 'event response')
    const eventId = optionalString(event.eventID) ?? optionalString(event.id)
    if (!eventId) throw new Error('Malformed Sentry event response: event ID is required')

    return {
        environment: eventEnvironment(event),
        eventId,
        message: optionalString(event.message),
        release: releaseVersion(event.release),
        stackFrames: stackFrames(event.entries),
    }
}

function nextPageUrl(linkHeader: string | null) {
    if (!linkHeader) return null

    const nextLink = linkHeader.split(',').find((part) => part.includes('rel="next"') && part.includes('results="true"'))
    return nextLink?.match(/<([^>]+)>/u)?.[1] ?? null
}

function projectUrl(request: SentryApiRequest) {
    const baseUrl = normalizeSentryBaseUrl(request.apiBaseUrl)
    const organization = encodeURIComponent(request.organization)
    const project = encodeURIComponent(request.project)

    return `${baseUrl}/api/0/projects/${organization}/${project}`
}

export class SentryApiClient {
    private readonly fetchRequest: typeof fetch

    constructor(dependencies: SentryApiClientDependencies = { fetch: globalThis.fetch.bind(globalThis) }) {
        this.fetchRequest = dependencies.fetch
    }

    async validateProject(request: SentryApiRequest) {
        const url = `${projectUrl(request)}/`
        await this.requestJson(url, request.apiToken)
    }

    async listUnresolvedIssues(request: SentryApiRequest) {
        const url = new URL(`${projectUrl(request)}/issues/`)
        url.searchParams.set('limit', '100')
        url.searchParams.set('query', `is:unresolved environment:"${request.environment.replace(/"/gu, '\\"')}"`)
        const issues: SentryIssueSummary[] = []
        let pageUrl: string | null = url.toString()

        while (pageUrl) {
            const response = await this.request(pageUrl, request.apiToken)
            const body: unknown = await response.json()
            if (!Array.isArray(body)) throw new Error('Malformed Sentry issue list response')
            issues.push(...body.map(issueSummary))
            pageUrl = nextPageUrl(response.headers.get('Link'))
        }

        return issues
    }

    async loadRecommendedEvent(request: SentryApiRequest, issueId: string) {
        const baseUrl = normalizeSentryBaseUrl(request.apiBaseUrl)
        const organization = encodeURIComponent(request.organization)
        const id = encodeURIComponent(issueId)
        const url = new URL(`${baseUrl}/api/0/organizations/${organization}/issues/${id}/events/recommended/`)
        url.searchParams.append('environment', request.environment)

        return issueEvent(await this.requestJson(url.toString(), request.apiToken))
    }

    private async requestJson(url: string, apiToken: string): Promise<unknown> {
        const response = await this.request(url, apiToken)

        return response.json()
    }

    private async request(url: string, apiToken: string) {
        const response = await this.fetchRequest(url, {
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${apiToken}`,
            },
        })
        if (response.ok) return response

        const retryAfter = response.headers.get('Retry-After')
        const retryMessage = retryAfter ? ` Retry after ${retryAfter} seconds.` : ''
        throw new SentryApiError(`Sentry request failed with status ${response.status}.${retryMessage}`, response.status)
    }
}

export const sentryApiClient = new SentryApiClient()

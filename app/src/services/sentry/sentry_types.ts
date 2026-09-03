import type { CardType } from '../../data/data_types'

export const DEFAULT_SENTRY_BASE_URL = 'https://sentry.io'
export const DEFAULT_SENTRY_ENVIRONMENT = 'production'

export interface SentryProjectSettings {
    apiBaseUrl: string
    apiToken: string
    automaticImport: boolean
    cardState: string
    cardType: CardType | ''
    environment: string
    firstImportConfirmed: boolean
    organization: string
    project: string
}

export interface SentryIssueSummary {
    count: string | null
    culprit: string | null
    firstSeen: string | null
    id: string
    lastSeen: string | null
    link: string | null
    title: string
}

export interface SentryStackFrame {
    columnNumber: number | null
    fileName: string | null
    functionName: string | null
    lineNumber: number | null
}

export interface SentryIssueEvent {
    environment: string | null
    eventId: string
    message: string | null
    release: string | null
    stackFrames: SentryStackFrame[]
}

export interface SentryIssueImport {
    event: SentryIssueEvent
    issue: SentryIssueSummary
}

export function createDefaultSentryProjectSettings(): SentryProjectSettings {
    return {
        apiBaseUrl: DEFAULT_SENTRY_BASE_URL,
        apiToken: '',
        automaticImport: false,
        cardState: '',
        cardType: '',
        environment: DEFAULT_SENTRY_ENVIRONMENT,
        firstImportConfirmed: false,
        organization: '',
        project: '',
    }
}

export function normalizeSentryBaseUrl(baseUrl: string) {
    const normalized = baseUrl.trim().replace(/\/+$/u, '')
    if (!normalized) throw new Error('Sentry API base URL is required')

    const parsed = new URL(normalized)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('Sentry API base URL must use HTTP or HTTPS')
    }

    return parsed.toString().replace(/\/$/u, '')
}

export function sentryIdentityKey(baseUrl: string, organization: string, issueId: string) {
    return `${normalizeSentryBaseUrl(baseUrl).toLowerCase()}\n${organization.trim().toLowerCase()}\n${issueId.trim()}`
}

/** True when every Sentry setting needed to connect and import is filled in. */
export function isSentryConfigurationComplete(settings: SentryProjectSettings) {
    return settings.apiBaseUrl.trim().length > 0
        && settings.apiToken.trim().length > 0
        && settings.organization.trim().length > 0
        && settings.project.trim().length > 0
        && settings.environment.trim().length > 0
        && settings.cardType.length > 0
        && settings.cardState.trim().length > 0
}

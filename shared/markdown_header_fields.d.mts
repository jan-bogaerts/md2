export type HeaderValue = string | string[] | Record<string, string>
export type MarkdownHeaderFields = Record<string, HeaderValue>

export interface HeaderSplit {
    body: string
    hasHeader: boolean
    rawHeader: string
}

export interface CardIdentity {
    internalId: string
    status: string
}

export function splitHeader(content: string): HeaderSplit
export function parseHeaderFields(headerText: string): MarkdownHeaderFields
export function readCardIdentity(content: string): CardIdentity | null

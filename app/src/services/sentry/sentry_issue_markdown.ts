import type { SentryIssueImport, SentryStackFrame } from './sentry_types'

function displayValue(value: string | null) {
    return value ?? 'Not provided'
}

function frameLocation(frame: SentryStackFrame) {
    const line = frame.lineNumber === null ? '' : `:${frame.lineNumber}`
    const column = frame.columnNumber === null ? '' : `:${frame.columnNumber}`

    return `${frame.fileName ?? 'unknown file'}${line}${column}`
}

/** Builds card-safe Sentry details from already sanitized issue and event fields. */
export function buildSentryIssueMarkdown(importedIssue: SentryIssueImport) {
    const { event, issue } = importedIssue
    const link = issue.link ? `[Open issue in Sentry](${issue.link})` : 'Not provided'
    const frames = event.stackFrames.length > 0
        ? event.stackFrames.map((frame) => `- \`${frameLocation(frame)}\` — ${frame.functionName ?? 'unknown function'}`)
        : ['- No application stack frames provided.']

    return [
        '## Sentry issue',
        '',
        `**Title:** ${issue.title}`,
        '',
        `**Message:** ${displayValue(event.message)}`,
        '',
        `**Link:** ${link}`,
        '',
        `**First seen:** ${displayValue(issue.firstSeen)}`,
        '',
        `**Last seen:** ${displayValue(issue.lastSeen)}`,
        '',
        `**Occurrences:** ${displayValue(issue.count)}`,
        '',
        `**Release:** ${displayValue(event.release)}`,
        '',
        `**Environment:** ${displayValue(event.environment)}`,
        '',
        `**Culprit:** ${displayValue(issue.culprit)}`,
        '',
        `**Event ID:** ${event.eventId}`,
        '',
        '### Application stack frames',
        '',
        ...frames,
    ].join('\n')
}

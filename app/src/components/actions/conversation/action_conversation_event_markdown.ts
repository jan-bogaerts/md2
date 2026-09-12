import type { AgentConversationEvent } from '../../../data/data_types'
import { commandPreview, eventStatusLabel } from './event_display'
import { reasoningDisplay } from './reasoning_display'

function markdownCodeBlock(value: string) {
    const longestFence = Math.max(0, ...Array.from(value.matchAll(/`+/gu), ([fence]) => fence.length))
    const fence = '`'.repeat(Math.max(3, longestFence + 1))

    return `${fence}\n${value}\n${fence}`
}

function appendSection(sections: string[], label: string, value: string) {
    sections.push(`### ${label}\n\n${markdownCodeBlock(value)}`)
}

/** Serializes every field exposed by one conversation event renderer, independent of expansion state. */
export function actionConversationEventMarkdown(event: AgentConversationEvent) {
    const label = event.type === 'reasoning'
        ? 'Burning tokens'
        : event.type === 'commandExecution'
            ? commandPreview(event.command) || 'Command'
            : event.label ?? 'Agent event'
    const sections = [`## ${label}`, `**Status:** ${eventStatusLabel(event.status)}`]
    if (event.type === 'reasoning') {
        reasoningDisplay(event).sections.forEach((section, index) => {
            appendSection(sections, `Reasoning ${index + 1}`, section)
        })

        return sections.join('\n\n')
    }
    if (event.type === 'commandExecution') {
        appendSection(sections, 'Command', event.command ?? '')
        if (event.workingDirectory) appendSection(sections, 'Working directory', event.workingDirectory)
        if (event.content) appendSection(sections, 'Output', event.content)
        if (typeof event.exitCode === 'number' && Number.isSafeInteger(event.exitCode)) {
            sections.push(`**Exit code:** ${event.exitCode}`)
        }
        if (typeof event.durationMs === 'number' && Number.isFinite(event.durationMs)) {
            sections.push(`**Duration:** ${event.durationMs} ms`)
        }

        return sections.join('\n\n')
    }
    if (event.content.trim().length > 0) appendSection(sections, 'Content', event.content)
    if (event.output?.trim()) appendSection(sections, 'Output', event.output)
    if (typeof event.durationMs === 'number' && Number.isFinite(event.durationMs)) {
        sections.push(`**Duration:** ${event.durationMs} ms`)
    }

    return sections.join('\n\n')
}

import { describe, expect, it } from 'vitest'
import type { AgentConversationEvent } from '../../../data/data_types'
import { actionConversationEventMarkdown } from './action_conversation_event_markdown'

function event(overrides: Partial<AgentConversationEvent>): AgentConversationEvent {
    return {
        content: '',
        id: 'event-1',
        timestamp: '2026-09-12T10:00:00.000Z',
        type: 'tool',
        ...overrides,
    }
}

describe('actionConversationEventMarkdown', () => {
    it('serializes complete command detail while collapsed state stays irrelevant', () => {
        const markdown = actionConversationEventMarkdown(event({
            command: 'npm test\n```nested```',
            content: 'failed output',
            durationMs: 1250,
            exitCode: 1,
            status: 'failed',
            type: 'commandExecution',
            workingDirectory: 'C:/repo',
        }))

        expect(markdown).toContain('## npm test ```nested```')
        expect(markdown).toContain('**Status:** Failed')
        expect(markdown).toContain('### Command\n\n````\nnpm test\n```nested```\n````')
        expect(markdown).toContain('### Working directory')
        expect(markdown).toContain('### Output')
        expect(markdown).toContain('**Exit code:** 1')
        expect(markdown).toContain('**Duration:** 1250 ms')
    })

    it('serializes all selected reasoning sections', () => {
        const markdown = actionConversationEventMarkdown(event({
            details: ['unused detail'],
            status: 'completed',
            summary: ['First section', 'Second section'],
            type: 'reasoning',
        }))

        expect(markdown).toContain('## Burning tokens')
        expect(markdown).toContain('### Reasoning 1\n\n```\nFirst section\n```')
        expect(markdown).toContain('### Reasoning 2\n\n```\nSecond section\n```')
        expect(markdown).not.toContain('unused detail')
    })

    it('serializes generic label, status, content, output, and duration', () => {
        const markdown = actionConversationEventMarkdown(event({
            content: 'Input',
            durationMs: 50,
            label: 'Web search',
            output: 'Result',
            status: 'completed',
        }))

        expect(markdown).toContain('## Web search')
        expect(markdown).toContain('**Status:** Completed')
        expect(markdown).toContain('### Content')
        expect(markdown).toContain('### Output')
        expect(markdown).toContain('**Duration:** 50 ms')
    })
})

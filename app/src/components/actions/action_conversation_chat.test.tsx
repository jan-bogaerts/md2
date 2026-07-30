import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentConversation, AgentConversationEvent, AgentConversationMessage } from '../../data/data_types'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActionConversationChat } from './action_conversation_chat'

let clientHeight = 100
let scrollHeight = 300
let scrollPositions = new WeakMap<HTMLElement, number>()
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
const originalScrollTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop')

function message(id: string, content: string): AgentConversationMessage {
    return { content, id, role: 'assistant', timestamp: '2026-07-27T10:00:00.000Z' }
}

function conversation(
    path: string,
    messages: AgentConversationMessage[],
    events: AgentConversationEvent[] = [],
    agent: string | null = null,
): AgentConversation {
    return {
        actionId: 'review',
        cardInternalId: 'card-1',
        cardPath: 'design/F-83.md',
        completedAt: '2026-07-27T10:01:00.000Z',
        events,
        hasExplicitTitle: true,
        id: path,
        messages,
        path,
        providerSessions: agent ? [{
            agent,
            conversationId: 'provider-1',
            createdAt: '2026-07-27T10:00:00.000Z',
            lastUsedAt: '2026-07-27T10:01:00.000Z',
            synchronizedThroughMessageId: messages.at(-1)?.id ?? '',
        }] : [],
        startedAt: '2026-07-27T10:00:00.000Z',
        status: 'completed',
        title: path,
    }
}

function renderChat(value: AgentConversation | null) {
    return render(
        <AppThemeProvider>
            <ActionConversationChat conversation={value} status="idle" />
        </AppThemeProvider>,
    )
}

function restoreProperty(name: 'clientHeight' | 'scrollHeight' | 'scrollTop', descriptor?: PropertyDescriptor) {
    if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, name, descriptor)
        return
    }

    delete HTMLElement.prototype[name]
}

describe('ActionConversationChat', () => {
    beforeEach(() => {
        clientHeight = 100
        scrollHeight = 300
        scrollPositions = new WeakMap<HTMLElement, number>()
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => clientHeight })
        Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollHeight })
        Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
            configurable: true,
            get() {
                return scrollPositions.get(this) ?? 0
            },
            set(value: number) {
                const maximumScrollTop = Math.max(0, scrollHeight - clientHeight)
                scrollPositions.set(this, Math.max(0, Math.min(value, maximumScrollTop)))
            },
        })
    })

    afterEach(() => {
        cleanup()
        restoreProperty('clientHeight', originalClientHeight)
        restoreProperty('scrollHeight', originalScrollHeight)
        restoreProperty('scrollTop', originalScrollTop)
    })

    it('starts at the end when a conversation loads', () => {
        renderChat(conversation('first.json', [message('message-1', 'First')]))

        expect(screen.getByLabelText('Conversation chat').scrollTop).toBe(200)
    })

    it('returns to the end when the selected conversation changes', () => {
        const first = conversation('first.json', [message('message-1', 'First')])
        const second = conversation('second.json', [message('message-2', 'Second')])
        const { rerender } = renderChat(first)
        const viewport = screen.getByLabelText('Conversation chat')
        viewport.scrollTop = 40
        fireEvent.scroll(viewport)

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={second} status="idle" />
            </AppThemeProvider>,
        )

        expect(viewport.scrollTop).toBe(200)
    })

    it('keeps new content visible while stuck to the end', () => {
        const first = conversation('first.json', [message('message-1', 'First')])
        const grown = conversation('first.json', [message('message-1', 'First'), message('message-2', 'Second')])
        const { rerender } = renderChat(first)
        const viewport = screen.getByLabelText('Conversation chat')
        scrollHeight = 400

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={grown} status="idle" />
            </AppThemeProvider>,
        )

        expect(viewport.scrollTop).toBe(300)
    })

    it('does not move when new content arrives after the user scrolls up', () => {
        const first = conversation('first.json', [message('message-1', 'First')])
        const grown = conversation('first.json', [message('message-1', 'First'), message('message-2', 'Second')])
        const { rerender } = renderChat(first)
        const viewport = screen.getByLabelText('Conversation chat')
        viewport.scrollTop = 40
        fireEvent.scroll(viewport)
        scrollHeight = 400

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={grown} status="idle" />
            </AppThemeProvider>,
        )

        expect(viewport.scrollTop).toBe(40)
    })

    it('restores sticky behavior after the user returns within the end tolerance', () => {
        const first = conversation('first.json', [message('message-1', 'First')])
        const grown = conversation('first.json', [message('message-1', 'First'), message('message-2', 'Second')])
        const { rerender } = renderChat(first)
        const viewport = screen.getByLabelText('Conversation chat')
        viewport.scrollTop = 196
        fireEvent.scroll(viewport)
        scrollHeight = 400

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={grown} status="idle" />
            </AppThemeProvider>,
        )

        expect(viewport.scrollTop).toBe(300)
    })

    it('keeps empty content at the end when it is shorter than the viewport', () => {
        clientHeight = 200
        scrollHeight = 80
        const { rerender } = renderChat(null)
        const viewport = screen.getByLabelText('Conversation chat')
        fireEvent.scroll(viewport)
        scrollHeight = 100

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation('empty.json', [])} status="idle" />
            </AppThemeProvider>,
        )

        expect(viewport.scrollTop).toBe(0)
    })

    it('keeps vertical scrolling on the chat viewport and wraps long message tokens', () => {
        const path = 'C:\\Users\\janbo\\Documents\\dev\\md2\\design/feature_descriptions/F_69_config_in_dialog.md'
        renderChat(conversation('first.json', [message('message-1', path)]))

        const viewport = screen.getByLabelText('Conversation chat')
        const messageBox = screen.getByText(path).parentElement?.parentElement

        expect(viewport).toHaveStyle({ overflowX: 'hidden', overflowY: 'auto' })
        expect(messageBox).toHaveStyle({ flexShrink: '0', minWidth: '0', overflowWrap: 'anywhere' })
        expect(messageBox).not.toHaveStyle({ overflowX: 'auto' })
    })

    it('renders Codex messages and activity in backend sequence order', () => {
        const timestamp = '2026-07-27T10:00:00.000Z'
        const firstMessage = { ...message('message-1', 'First message'), agent: 'codex', sequence: 1 }
        const finalMessage = { ...message('message-2', 'Final message'), agent: 'codex', sequence: 4 }
        const events: AgentConversationEvent[] = [
            {
                content: 'Inspect code',
                id: 'reasoning-1',
                providerItemId: 'reasoning-1',
                sequence: 2,
                status: 'inProgress',
                summary: ['Inspect code'],
                timestamp,
                type: 'reasoning',
            },
            {
                command: 'npm test',
                content: '',
                id: 'command-1',
                providerItemId: 'command-1',
                sequence: 3,
                status: 'inProgress',
                timestamp,
                type: 'commandExecution',
            },
        ]

        renderChat(conversation('codex.json', [finalMessage, firstMessage], events.reverse(), 'codex'))

        const orderedText = ['First message', 'Inspect code', 'npm test', 'Final message']
        const elements = orderedText.map((text) => screen.getByText(text))
        for (let index = 1; index < elements.length; index += 1) {
            expect(elements[index - 1].compareDocumentPosition(elements[index]) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
        }
    })

    it('renders live structured activity before a provider session or assistant message exists', () => {
        const activity: AgentConversationEvent = {
            content: 'Inspect code',
            id: 'reasoning-1',
            providerItemId: 'reasoning-1',
            sequence: 2,
            status: 'inProgress',
            summary: ['Inspect code'],
            timestamp: 'now',
            type: 'reasoning',
        }

        renderChat(conversation('codex.json', [{ ...message('message-1', 'Start'), sequence: 1 }], [activity]))

        expect(screen.getByText('Reasoning')).toBeInTheDocument()
        expect(screen.getByText('Inspect code')).toBeInTheDocument()
    })

    it('shows reasoning summary sections and lifecycle state', () => {
        const activity: AgentConversationEvent = {
            content: 'Summary one\n\nSummary two',
            details: ['Raw detail'],
            id: 'reasoning-1',
            providerItemId: 'reasoning-1',
            sequence: 2,
            status: 'inProgress',
            summary: ['Summary one', 'Summary two'],
            timestamp: 'now',
            type: 'reasoning',
        }

        renderChat(conversation('codex.json', [{ ...message('message-1', 'Start'), agent: 'codex', sequence: 1 }], [activity], 'codex'))

        expect(screen.getByText('Reasoning')).toBeInTheDocument()
        expect(screen.getByText('Running')).toBeInTheDocument()
        expect(screen.getByText('Summary one')).toBeInTheDocument()
        expect(screen.getByText('Summary two')).toBeInTheDocument()
        expect(screen.queryByText('Raw detail')).not.toBeInTheDocument()
    })

    it('keeps reasoning visible while its conversation runs and removes it when the conversation completes', () => {
        const activity: AgentConversationEvent = {
            content: 'Inspect code',
            id: 'reasoning-1',
            providerItemId: 'reasoning-1',
            sequence: 2,
            status: 'completed',
            summary: ['Inspect code'],
            timestamp: 'now',
            type: 'reasoning',
        }
        const runningConversation: AgentConversation = {
            ...conversation(
                'codex.json',
                [{ ...message('message-1', 'Start'), agent: 'codex', sequence: 1 }],
                [activity],
                'codex',
            ),
            completedAt: null,
            status: 'running',
        }
        const { rerender } = renderChat(runningConversation)

        expect(screen.getByText('Inspect code')).toBeInTheDocument()
        expect(screen.getByText('Reasoning')).toBeInTheDocument()

        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{ ...runningConversation, completedAt: 'now', status: 'completed' }}
                    status="idle"
                />
            </AppThemeProvider>,
        )

        expect(screen.queryByText('Inspect code')).not.toBeInTheDocument()
        expect(screen.queryByText('Reasoning')).not.toBeInTheDocument()
    })

    it('omits completed reasoning when a conversation opens', () => {
        const activity: AgentConversationEvent = {
            content: 'Finished inspection',
            id: 'reasoning-1',
            providerItemId: 'reasoning-1',
            sequence: 2,
            status: 'completed',
            summary: ['Finished inspection'],
            timestamp: 'now',
            type: 'reasoning',
        }

        renderChat(conversation(
            'codex.json',
            [{ ...message('message-1', 'Saved answer'), agent: 'codex', sequence: 3 }],
            [activity],
            'codex',
        ))

        expect(screen.getByText('Saved answer')).toBeInTheDocument()
        expect(screen.queryByText('Finished inspection')).not.toBeInTheDocument()
    })

    it.each([
        ['failed', 'Failed'],
        ['declined', 'Declined'],
    ])('keeps %s reasoning visible with its error state', (status, label) => {
        const activity: AgentConversationEvent = {
            content: `${label} inspection`,
            id: `reasoning-${status}`,
            providerItemId: `reasoning-${status}`,
            sequence: 2,
            status,
            summary: [`${label} inspection`],
            timestamp: 'now',
            type: 'reasoning',
        }

        renderChat(conversation(
            'codex.json',
            [{ ...message('message-1', 'Start'), agent: 'codex', sequence: 1 }],
            [activity],
            'codex',
        ))

        expect(screen.getByText(label)).toBeInTheDocument()
        expect(screen.getByText(`${label} inspection`)).toBeInTheDocument()
    })

    it('keeps completed non-reasoning activity visible', () => {
        const activity: AgentConversationEvent = {
            content: 'Search complete',
            id: 'search-1',
            label: 'Web search',
            providerItemId: 'search-1',
            sequence: 2,
            status: 'completed',
            timestamp: 'now',
            type: 'webSearch',
        }

        renderChat(conversation(
            'codex.json',
            [{ ...message('message-1', 'Start'), agent: 'codex', sequence: 1 }],
            [activity],
            'codex',
        ))

        expect(screen.getByRole('button', { name: 'Web search details' })).toBeInTheDocument()
        expect(screen.getByText('Completed')).toBeInTheDocument()
    })

    it('keeps one command collapsed and exposes exact final details accessibly', () => {
        const command = 'node -e "console.log(\'héllo\')" \\\n--flag'
        const activity: AgentConversationEvent = {
            command,
            content: 'line one\nline two',
            durationMs: 42,
            exitCode: 1,
            id: 'command-completed',
            output: 'line one\nline two',
            providerItemId: 'command-1',
            sequence: 2,
            status: 'failed',
            timestamp: 'now',
            type: 'commandExecution',
            workingDirectory: 'C:\\repo',
        }

        renderChat(conversation('codex.json', [{ ...message('message-1', 'Start'), agent: 'codex', sequence: 1 }], [activity], 'codex'))

        const button = screen.getByRole('button', { name: /Command details:/u })
        expect(button).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText(command)).not.toBeInTheDocument()

        fireEvent.click(button)

        expect(button).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByText('Command').parentElement?.querySelector('pre')?.textContent).toBe(command)
        expect(screen.getByText('Output').parentElement?.querySelector('pre')?.textContent).toBe('line one\nline two')
        expect(screen.getByText('Exit code: 1')).toBeInTheDocument()
        expect(screen.getByText('Duration: 42 ms')).toBeInTheDocument()
    })

    it('renders normalized generic activity without raw JSON', () => {
        const activity: AgentConversationEvent = {
            content: 'Query: Codex schema\nResult Count: 2',
            id: 'search-1',
            label: 'Web search',
            output: '',
            providerItemId: 'search-1',
            sequence: 2,
            status: 'completed',
            timestamp: 'now',
            type: 'webSearch',
        }

        renderChat(conversation('codex.json', [{ ...message('message-1', 'Start'), agent: 'codex', sequence: 1 }], [activity], 'codex'))
        const button = screen.getByRole('button', { name: 'Web search details' })
        fireEvent.click(button)

        expect(screen.getByText('Query: Codex schema')).toBeInTheDocument()
        expect(screen.getByText('Result Count: 2')).toBeInTheDocument()
        expect(screen.queryByText(/\{"query"/u)).not.toBeInTheDocument()
    })

    it('omits legacy null command metadata', () => {
        const activity: AgentConversationEvent = {
            command: 'npm test',
            content: '',
            durationMs: null as unknown as number,
            exitCode: null as unknown as number,
            id: 'command-1',
            providerItemId: 'command-1',
            sequence: 2,
            status: 'completed',
            timestamp: 'now',
            type: 'commandExecution',
        }

        renderChat(conversation('codex.json', [{ ...message('message-1', 'Start'), sequence: 1 }], [activity]))
        fireEvent.click(screen.getByRole('button', { name: 'Command details: npm test' }))

        expect(screen.queryByText(/Exit code:/u)).not.toBeInTheDocument()
        expect(screen.queryByText(/Duration:/u)).not.toBeInTheDocument()
    })

    it('does not show Codex activity boxes for another provider', () => {
        const activity: AgentConversationEvent = {
            content: 'hidden activity',
            id: 'activity-1',
            label: 'Web search',
            sequence: 2,
            status: 'completed',
            timestamp: 'now',
            type: 'webSearch',
        }

        renderChat(conversation('claude.json', [{ ...message('message-1', '**Assistant Markdown**'), agent: 'claude', sequence: 1 }], [activity], 'claude'))

        expect(screen.getByText('Assistant Markdown').tagName).toBe('STRONG')
        expect(screen.queryByRole('button', { name: 'Web search details' })).not.toBeInTheDocument()
    })

    it('keeps assistant Markdown and provider completion separators in one balloon', () => {
        renderChat(conversation('codex.json', [{
            ...message('message-1', '**First**\n\nSecond'),
            agent: 'codex',
            sequence: 1,
        }], [], 'codex'))

        const first = screen.getByText('First')
        const second = screen.getByText('Second')
        expect(first.tagName).toBe('STRONG')
        expect(first.closest('.mdxeditor-content')).toBe(second.closest('.mdxeditor-content'))
        expect(first.closest('.mdxeditor-content')?.querySelectorAll('p')).toHaveLength(2)
    })

    it('updates a started command in place when completion arrives', () => {
        const started: AgentConversationEvent = {
            command: 'npm test',
            content: '',
            id: 'command-started',
            providerItemId: 'command-1',
            sequence: 2,
            status: 'inProgress',
            timestamp: 'now',
            type: 'commandExecution',
        }
        const first = conversation(
            'codex.json',
            [{ ...message('message-1', 'Start'), agent: 'codex', sequence: 1 }],
            [started],
            'codex',
        )
        const { rerender } = renderChat(first)
        const completed = {
            ...started,
            id: 'command-completed',
            output: 'passed',
            status: 'completed',
        }

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={{ ...first, events: [completed] }} status="idle" />
            </AppThemeProvider>,
        )

        expect(screen.getAllByRole('button', { name: 'Command details: npm test' })).toHaveLength(1)
        expect(screen.getByText('Completed')).toBeInTheDocument()
    })

    it('keeps sticky position while reasoning and command output grow', () => {
        const firstActivity: AgentConversationEvent = {
            content: 'Inspect',
            id: 'reasoning-1',
            providerItemId: 'reasoning-1',
            sequence: 2,
            status: 'inProgress',
            summary: ['Inspect'],
            timestamp: 'now',
            type: 'reasoning',
        }
        const grownActivity = {
            ...firstActivity,
            content: 'Inspect more',
            summary: ['Inspect more'],
        }
        const commandActivity: AgentConversationEvent = {
            command: 'npm test',
            content: '',
            id: 'command-1',
            output: '',
            providerItemId: 'command-1',
            sequence: 3,
            status: 'inProgress',
            timestamp: 'now',
            type: 'commandExecution',
        }
        const first = conversation(
            'codex.json',
            [{ ...message('message-1', 'Start'), agent: 'codex', sequence: 1 }],
            [firstActivity, commandActivity],
            'codex',
        )
        const grown = conversation(
            'codex.json',
            first.messages,
            [grownActivity, { ...commandActivity, content: 'line one\nline two', output: 'line one\nline two' }],
            'codex',
        )
        const { rerender } = renderChat(first)
        const viewport = screen.getByLabelText('Conversation chat')
        scrollHeight = 400

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={grown} status="idle" />
            </AppThemeProvider>,
        )

        expect(viewport.scrollTop).toBe(300)
    })
})

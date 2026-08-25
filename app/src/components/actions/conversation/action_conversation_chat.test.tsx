import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
    AgentConversation,
    AgentConversationEntry,
    AgentConversationEvent,
    AgentConversationEventEntry,
    AgentConversationMessageEntry,
} from '../../../data/data_types'
import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../data/electron_action_bridge'
import { dataService } from '../../../services/data/data_service'
import { dialogService } from '../../../services/dialog_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { AppThemeContext } from '../../../theme/theme_context'
import { useAppTheme } from '../../../theme/use_app_theme'
import { ActionConversationChat } from './action_conversation_chat'

let clientHeight = 100
let scrollHeight = 300
let scrollPositions = new WeakMap<HTMLElement, number>()
let resizeObserverCallback: ResizeObserverCallback | null = null
let disconnectedViewportObserverCount = 0
const observeViewport = vi.fn()
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
const originalScrollTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop')

class ControllableResizeObserver {
    private readonly callback: ResizeObserverCallback
    private observesViewport = false

    constructor(callback: ResizeObserverCallback) {
        this.callback = callback
    }

    disconnect() {
        if (this.observesViewport) disconnectedViewportObserverCount += 1
    }

    observe(target: Element) {
        if (!(target instanceof HTMLElement) || target.getAttribute('aria-label') !== 'Conversation chat') return

        this.observesViewport = true
        resizeObserverCallback = this.callback
        observeViewport(target)
    }

    unobserve(target: Element) {
        if (target instanceof HTMLElement && target.getAttribute('aria-label') === 'Conversation chat') {
            this.observesViewport = false
        }
    }
}

function message(id: string, content: string): AgentConversationMessageEntry {
    return { content, id, kind: 'message', role: 'assistant', timestamp: '2026-07-27T10:00:00.000Z' }
}

function eventEntry(event: AgentConversationEvent): AgentConversationEventEntry {
    return { ...event, kind: 'event' }
}

function toolEvent(
    id: string,
    type: string,
    status = 'completed',
    overrides: Partial<AgentConversationEvent> = {},
): AgentConversationEventEntry {
    return eventEntry({
        content: `${id} input`,
        id,
        label: id,
        providerItemId: id,
        status,
        timestamp: 'now',
        type,
        ...overrides,
    })
}

function completedReasoning(id: string): AgentConversationEventEntry {
    return {
        content: '  ',
        id,
        kind: 'event',
        providerItemId: id,
        status: 'completed',
        timestamp: 'now',
        type: 'reasoning',
    }
}

function conversation(
    path: string,
    entries: AgentConversationEntry[],
    agent: string | null = null,
): AgentConversation {
    return {
        actionId: 'review',
        cardInternalId: 'card-1',
        cardPath: 'design/F-83.md',
        completedAt: '2026-07-27T10:01:00.000Z',
        entries,
        hasExplicitTitle: true,
        id: path,
        path,
        providerSessions: agent ? [{
            agent,
            conversationId: 'provider-1',
            createdAt: '2026-07-27T10:00:00.000Z',
            lastUsedAt: '2026-07-27T10:01:00.000Z',
            synchronizedThroughMessageId: entries.findLast((entry) => entry.kind === 'message')?.id ?? '',
        }] : [],
        startedAt: '2026-07-27T10:00:00.000Z',
        status: 'completed',
        timer: { elapsedMs: 60_000, runningStartedAt: null },
        title: path,
        viewed: true,
    }
}

function renderChat(value: AgentConversation | null, status: PopupRunStatus = 'idle') {
    return render(
        <AppThemeProvider>
            <ActionConversationChat conversation={value} status={status} />
        </AppThemeProvider>,
    )
}

function reservedBlockCount() {
    return document.querySelectorAll('[data-conversation-reserved-block]').length
}

function MarkdownContentSxOverride({ children }: { children: ReactNode }) {
    const theme = useAppTheme()
    const value = { ...theme, markdownContentSx: { paddingTop: '37px' } }

    return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
}

function restoreProperty(name: 'clientHeight' | 'scrollHeight' | 'scrollTop', descriptor?: PropertyDescriptor) {
    if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, name, descriptor)
        return
    }

    delete HTMLElement.prototype[name]
}

function reportViewportResize() {
    if (!resizeObserverCallback) throw new Error('ResizeObserver callback was not registered')

    resizeObserverCallback([], {} as ResizeObserver)
}

describe('ActionConversationChat', () => {
    beforeEach(() => {
        clientHeight = 100
        scrollHeight = 300
        scrollPositions = new WeakMap<HTMLElement, number>()
        resizeObserverCallback = null
        disconnectedViewportObserverCount = 0
        observeViewport.mockClear()
        vi.stubGlobal('ResizeObserver', ControllableResizeObserver)
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
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        restoreProperty('clientHeight', originalClientHeight)
        restoreProperty('scrollHeight', originalScrollHeight)
        restoreProperty('scrollTop', originalScrollTop)
    })

    it('starts at the end when a conversation loads', () => {
        renderChat(conversation('first.json', [message('message-1', 'First')]))

        expect(screen.getByLabelText('Conversation chat').scrollTop).toBe(200)
    })

    it('keeps an end-stuck viewport at the end after its height shrinks', () => {
        const { unmount } = renderChat(conversation('first.json', [message('message-1', 'First')]))
        const viewport = screen.getByLabelText('Conversation chat')
        expect(observeViewport).toHaveBeenCalledWith(viewport)

        clientHeight = 80
        reportViewportResize()

        expect(viewport.scrollTop).toBe(220)
        unmount()
        expect(disconnectedViewportObserverCount).toBe(1)
    })

    it('preserves a scrolled-up position after the viewport height changes', () => {
        renderChat(conversation('first.json', [message('message-1', 'First')]))
        const viewport = screen.getByLabelText('Conversation chat')
        viewport.scrollTop = 40
        fireEvent.scroll(viewport)

        clientHeight = 80
        reportViewportResize()

        expect(viewport.scrollTop).toBe(40)
    })

    it('restores resize stickiness after the user returns within the end tolerance', () => {
        renderChat(conversation('first.json', [message('message-1', 'First')]))
        const viewport = screen.getByLabelText('Conversation chat')
        viewport.scrollTop = 196
        fireEvent.scroll(viewport)

        clientHeight = 80
        reportViewportResize()

        expect(viewport.scrollTop).toBe(220)
    })

    it('keeps duration and context usage indicator as the final row inside the scrollable transcript', async () => {
        const value = conversation('first.json', [message('message-1', 'First')])
        value.contextWindowUsage = { capacityTokens: 258_400, usedTokens: 42_000 }
        renderChat(value)

        const viewport = screen.getByLabelText('Conversation chat')
        const metadata = screen.getByLabelText('Conversation metadata')
        const progress = screen.getByRole('progressbar', { name: 'Context usage' })
        expect(viewport).toContainElement(metadata)
        expect(viewport.lastElementChild).toBe(metadata)
        expect(metadata).toContainElement(screen.getByLabelText('Elapsed time'))
        expect(metadata).toContainElement(progress)
        expect(progress).toHaveAttribute('aria-valuenow', '16')
        expect(screen.queryByText('context: 16%')).not.toBeInTheDocument()
        expect(metadata).toHaveStyle({ alignItems: 'baseline' })

        expect(screen.getAllByRole('progressbar')).toHaveLength(1)
        const track = progress.parentElement?.querySelector('[aria-hidden="true"]')
        expect(track).toBeInTheDocument()
        expect(track).toHaveAttribute('aria-valuenow', '100')

        fireEvent.mouseOver(progress)
        expect(await screen.findByText('Context usage: 16%', { selector: '.MuiTooltip-tooltip' })).toBeInTheDocument()
        fireEvent.mouseLeave(progress)
        await waitFor(() => expect(screen.queryByText('Context usage: 16%', {selector: '.MuiTooltip-tooltip'})).not.toBeInTheDocument())
        fireEvent.touchStart(progress)
        expect(await screen.findByText('Context usage: 16%', { selector: '.MuiTooltip-tooltip' }, {timeout: 1_500})).toBeInTheDocument()

        viewport.scrollTop = 40
        fireEvent.scroll(viewport)

        expect(viewport.scrollTop).toBe(40)
    })

    it('caps context occupancy and hides unavailable context without hiding duration', async () => {
        const value = conversation('first.json', [])
        value.contextWindowUsage = { capacityTokens: 100, usedTokens: 125 }
        const { rerender } = renderChat(value)

        const progress = screen.getByRole('progressbar', { name: 'Context usage' })
        expect(progress).toHaveAttribute('aria-valuenow', '100')
        fireEvent.mouseOver(progress)
        expect(await screen.findByText('Context usage: 100%', { selector: '.MuiTooltip-tooltip' })).toBeInTheDocument()

        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{ ...value, contextWindowUsage: { capacityTokens: 0, usedTokens: 1 } }}
                    status="idle"
                />
            </AppThemeProvider>,
        )

        expect(screen.queryByRole('progressbar', { name: 'Context usage' })).not.toBeInTheDocument()
        await waitFor(() => expect(screen.queryByText(/Context usage:/u, {selector: '.MuiTooltip-tooltip'})).not.toBeInTheDocument())
        expect(screen.getByLabelText('Elapsed time')).toBeInTheDocument()
    })

    it('hides idle status while keeping duration visible', () => {
        renderChat(conversation('completed.json', []))

        expect(screen.queryByRole('status')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('1:00')
    })

    it('uses the derived Markdown style provided by the app theme', () => {
        render(
            <AppThemeProvider>
                <MarkdownContentSxOverride>
                    <ActionConversationChat
                        conversation={conversation('styled.json', [message('message-1', 'Styled')])}
                        status="idle"
                    />
                </MarkdownContentSxOverride>
            </AppThemeProvider>,
        )
        const messageBox = screen.getByText('Styled').closest('.mdxeditor-content')?.parentElement

        expect(messageBox).toHaveStyle({ paddingTop: '37px' })
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

    it('reserves one block only while the conversation is active', () => {
        const value = conversation('active.json', [message('message-1', 'Start')])
        const { rerender } = renderChat(value, 'running')

        expect(reservedBlockCount()).toBe(1)

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={value} status="completed" />
            </AppThemeProvider>,
        )

        expect(reservedBlockCount()).toBe(0)
    })

    it('replaces the baseline reservation with a running block', () => {
        const runningReasoning = toolEvent('Reasoning', 'reasoning', 'inProgress', { summary: ['Inspect code'] })

        renderChat(conversation('active.json', [runningReasoning], 'codex'), 'running')

        expect(screen.getByText('Inspect code')).toBeInTheDocument()
        expect(reservedBlockCount()).toBe(0)
    })

    it('keeps one baseline reservation when displayable running reasoning completes', () => {
        const firstReasoning = toolEvent('First reasoning', 'reasoning', 'inProgress', { summary: ['First'] })
        const secondReasoning = toolEvent('Second reasoning', 'reasoning', 'inProgress', { summary: ['Second'] })
        const runningConversation = conversation('active.json', [firstReasoning, secondReasoning], 'codex')
        const { rerender } = renderChat(runningConversation, 'running')

        expect(reservedBlockCount()).toBe(0)

        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{
                        ...runningConversation,
                        entries: [
                            { ...firstReasoning, status: 'completed' },
                            { ...secondReasoning, status: 'completed' },
                        ],
                    }}
                    status="running"
                />
            </AppThemeProvider>,
        )

        expect(reservedBlockCount()).toBe(1)
    })

    it('lets new permanent blocks consume surplus reservations down to one', () => {
        const firstReasoning = toolEvent('First reasoning', 'reasoning', 'inProgress', { summary: ['First'] })
        const secondReasoning = toolEvent('Second reasoning', 'reasoning', 'inProgress', { summary: ['Second'] })
        const runningConversation = conversation('active.json', [firstReasoning, secondReasoning], 'codex')
        const { rerender } = renderChat(runningConversation, 'running')
        const completedEntries = [
            { ...firstReasoning, status: 'completed', summary: ['  '] },
            { ...secondReasoning, status: 'completed', summary: ['\n'] },
        ]

        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{ ...runningConversation, entries: completedEntries }}
                    status="running"
                />
            </AppThemeProvider>,
        )
        expect(reservedBlockCount()).toBe(2)

        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{ ...runningConversation, entries: [...completedEntries, message('message-1', 'Permanent')] }}
                    status="running"
                />
            </AppThemeProvider>,
        )

        expect(screen.getByText('Permanent')).toBeInTheDocument()
        expect(reservedBlockCount()).toBe(1)
    })

    it('resets surplus reservations when the selected conversation changes', () => {
        const firstReasoning = toolEvent('First reasoning', 'reasoning', 'inProgress', { summary: ['First'] })
        const secondReasoning = toolEvent('Second reasoning', 'reasoning', 'inProgress', { summary: ['Second'] })
        const runningConversation = conversation('first.json', [firstReasoning, secondReasoning], 'codex')
        const { rerender } = renderChat(runningConversation, 'running')

        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{
                        ...runningConversation,
                        entries: [
                            { ...firstReasoning, status: 'completed' },
                            { ...secondReasoning, status: 'completed' },
                        ],
                    }}
                    status="running"
                />
            </AppThemeProvider>,
        )
        expect(reservedBlockCount()).toBe(1)

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation('second.json', [], 'codex')} status="running" />
            </AppThemeProvider>,
        )

        expect(reservedBlockCount()).toBe(1)
    })

    it('does not move when running reasoning becomes retained completed blocks after the user scrolls up', () => {
        const firstReasoning = toolEvent('First reasoning', 'reasoning', 'inProgress', { summary: ['First'] })
        const secondReasoning = toolEvent('Second reasoning', 'reasoning', 'inProgress', { summary: ['Second'] })
        const runningConversation = conversation('active.json', [firstReasoning, secondReasoning], 'codex')
        const { rerender } = renderChat(runningConversation, 'running')
        const viewport = screen.getByLabelText('Conversation chat')
        viewport.scrollTop = 40
        fireEvent.scroll(viewport)
        scrollHeight = 400

        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{
                        ...runningConversation,
                        entries: [
                            { ...firstReasoning, status: 'completed' },
                            { ...secondReasoning, status: 'completed' },
                        ],
                    }}
                    status="running"
                />
            </AppThemeProvider>,
        )

        expect(reservedBlockCount()).toBe(1)
        expect(viewport.scrollTop).toBe(40)
    })

    it('stays pinned when running reasoning becomes retained completed blocks', () => {
        const firstReasoning = toolEvent('First reasoning', 'reasoning', 'inProgress', { summary: ['First'] })
        const secondReasoning = toolEvent('Second reasoning', 'reasoning', 'inProgress', { summary: ['Second'] })
        const runningConversation = conversation('active.json', [firstReasoning, secondReasoning], 'codex')
        const { rerender } = renderChat(runningConversation, 'running')
        const viewport = screen.getByLabelText('Conversation chat')
        scrollHeight = 400

        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{
                        ...runningConversation,
                        entries: [
                            { ...firstReasoning, status: 'completed' },
                            { ...secondReasoning, status: 'completed' },
                        ],
                    }}
                    status="running"
                />
            </AppThemeProvider>,
        )

        expect(reservedBlockCount()).toBe(1)
        expect(viewport.scrollTop).toBe(300)
    })

    it('opens web links outside the renderer', () => {
        renderChat(conversation('links.json', [message('message-1', '[Website](https://example.com/docs)')]))
        const link = screen.getByRole('link', { name: 'Website' })

        expect(link).toHaveAttribute('href', 'https://example.com/docs')
        expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        expect(link).toHaveAttribute('target', '_blank')
    })

    it('preserves absolute Windows paths emitted in Markdown links', () => {
        const path = 'C:\\repo\\design\\F_89_links.md'
        renderChat(conversation('links.json', [message('message-1', `[F_89_links.md](${path})`)]))

        expect(screen.getByRole('link', { name: 'F_89_links.md' }))
            .toHaveAttribute('href', 'C:%5Crepo%5Cdesign%5CF_89_links.md')
    })

    it('opens slash-prefixed absolute Windows links without browser navigation', async () => {
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            runningAgents: [],
            snapshot: { activeCards: [], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        })
        const openInEditor = vi.fn(async () => undefined)
        setActionBridgeOverride({ openInEditor } as unknown as ElectronActionBridge)
        const path = '/C:/repo/src/services/analysis/engine/event_engine.js:33'
        renderChat(conversation('links.json', [message('message-1', `[event_engine.js:33](${path})`)]))

        expect(fireEvent.click(screen.getByRole('link', { name: 'event_engine.js:33' }))).toBe(false)
        await waitFor(() => expect(openInEditor).toHaveBeenCalledWith({
            path: 'C:/repo/src/services/analysis/engine/event_engine.js:33',
            repositoryRoot: 'C:/repo',
        }))
    })

    it('reports invalid local file links without browser navigation', async () => {
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            runningAgents: [],
            snapshot: {
                activeCards: [],
                backgroundCards: [],
                repositoryFiles: [],
                workingFolder: 'design',
            },
        })
        const reportError = vi.spyOn(dialogService, 'error')
        setActionBridgeOverride({
            openInEditor: vi.fn(async () => {
                throw new Error('Local file link target does not exist: C:/repo/design/missing.md')
            }),
        } as unknown as ElectronActionBridge)
        const bubbledClick = vi.fn()
        renderChat(conversation('links.json', [message('message-1', '[Missing](design/missing.md)')]))
        document.addEventListener('click', bubbledClick)

        expect(fireEvent.click(screen.getByRole('link', { name: 'Missing' }))).toBe(false)
        document.removeEventListener('click', bubbledClick)
        expect(bubbledClick).not.toHaveBeenCalled()
        await waitFor(() => expect(reportError).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('target does not exist') }),
            { fallbackMessage: 'Local file link could not be opened: design/missing.md' },
        ))
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

    it('renders Codex entries in array order without sorting by sequence', () => {
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

        const value = conversation('codex.json', [], 'codex')
        value.entries = [
            { ...firstMessage, kind: 'message' },
            { ...events[0], kind: 'event', sequence: 30 },
            { ...events[1], kind: 'event', sequence: 20 },
            { ...finalMessage, kind: 'message', sequence: 10 },
        ]
        renderChat(value)

        const orderedText = ['First message', 'Inspect code', 'npm test', 'Final message']
        const elements = orderedText.map((text) => screen.getByText(text))
        for (let index = 1; index < elements.length; index += 1) {
            expect(elements[index - 1].compareDocumentPosition(elements[index]) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
        }
    })

    it('keeps completed reasoning with text collapsed while its conversation runs', () => {
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
                [{ ...message('message-1', 'Start'), agent: 'codex', sequence: 1 }, eventEntry(activity)],
                'codex',
            ),
            completedAt: null,
            status: 'running',
        }
        renderChat(runningConversation)

        const button = screen.getByRole('button', { name: 'Reasoning details' })
        expect(button).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByText('Completed')).toBeInTheDocument()
        expect(screen.queryByText('Inspect code')).not.toBeInTheDocument()
    })

    it('keeps completed reasoning with text collapsed when a conversation opens', () => {
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
            [{ ...message('message-1', 'Saved answer'), agent: 'codex', sequence: 3 }, eventEntry(activity)],
            'codex',
        ))

        expect(screen.getByText('Saved answer')).toBeInTheDocument()
        const button = screen.getByRole('button', { name: 'Reasoning details' })
        expect(button).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText('Finished inspection')).not.toBeInTheDocument()
        fireEvent.click(button)
        expect(screen.getByText('Finished inspection')).toBeInTheDocument()
    })

    it.each([
        ['summary', { content: 'ignored content', details: ['ignored detail'], summary: ['Selected summary'] }, 'Selected summary'],
        ['details', { content: 'ignored content', details: ['Selected detail'], summary: [] }, 'Selected detail'],
        ['content', { content: 'Selected content', details: [], summary: [] }, 'Selected content'],
    ])('renders completed reasoning from %s after expansion', (_source, fields, selectedText) => {
        const activity: AgentConversationEvent = {
            id: `reasoning-${_source}`,
            providerItemId: `reasoning-${_source}`,
            status: 'completed',
            timestamp: 'now',
            type: 'reasoning',
            ...fields,
        }
        renderChat(conversation('codex.json', [eventEntry(activity)], 'codex'))

        fireEvent.click(screen.getByRole('button', { name: 'Reasoning details' }))

        expect(screen.getByText(selectedText)).toBeInTheDocument()
        expect(screen.queryByText('ignored detail')).not.toBeInTheDocument()
        expect(screen.queryByText('ignored content')).not.toBeInTheDocument()
    })

    it('omits completed reasoning when selected sections contain only whitespace', () => {
        const activity: AgentConversationEvent = {
            content: 'ignored content',
            details: ['ignored detail'],
            id: 'reasoning-whitespace',
            providerItemId: 'reasoning-whitespace',
            status: 'completed',
            summary: [' ', '\n\t'],
            timestamp: 'now',
            type: 'reasoning',
        }
        renderChat(conversation('codex.json', [eventEntry(activity)], 'codex'))

        expect(screen.queryByRole('button', { name: 'Reasoning details' })).not.toBeInTheDocument()
        expect(screen.queryByText('ignored detail')).not.toBeInTheDocument()
        expect(screen.queryByText('ignored content')).not.toBeInTheDocument()
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
            [{ ...message('message-1', 'Start'), agent: 'codex', sequence: 1 }, eventEntry(activity)],
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
            [{ ...message('message-1', 'Start'), agent: 'codex', sequence: 1 }, eventEntry(activity)],
            'codex',
        ))

        expect(screen.getByRole('button', { name: 'Web search details' })).toBeInTheDocument()
        expect(screen.getByText('Completed')).toBeInTheDocument()
        expect(screen.queryByRole('group', { name: 'Completed tool calls' })).not.toBeInTheDocument()
    })

    it('groups every supported completed tool type in canonical order', () => {
        const entries = [
            toolEvent('Command call', 'commandExecution', 'completed', { command: 'Command call' }),
            toolEvent('File change', 'fileChange'),
            toolEvent('MCP call', 'mcpToolCall'),
            toolEvent('Dynamic call', 'dynamicToolCall'),
            toolEvent('Collaboration call', 'collabAgentToolCall'),
            toolEvent('Web search', 'webSearch'),
            toolEvent('Image view', 'imageView'),
            toolEvent('Claude read', 'tool.Read'),
        ]

        renderChat(conversation('tool-types.json', entries, 'codex'))

        const group = screen.getByRole('group', { name: 'Completed tool calls' })
        const summaryButton = within(group).getByRole('button', { name: 'Tools called (8)' })
        const summaryText = within(group).getByText('Tools called (8)')
        expect(group).toHaveStyle({ minWidth: '0', overflow: 'hidden' })
        expect(summaryButton).toHaveStyle({ minWidth: '0' })
        expect(summaryText).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
        expect(summaryButton).toHaveAttribute('aria-expanded', 'false')
        expect(within(group).queryByRole('button', { name: 'File change details' })).not.toBeInTheDocument()

        fireEvent.click(summaryButton)

        expect(summaryButton).toHaveAttribute('aria-expanded', 'true')
        const detailButtons = within(group).getAllByRole('button').slice(1)
        expect(detailButtons).toHaveLength(entries.length)
        expect(detailButtons.map(({ textContent }) => textContent)).toEqual([
            'Command callCompleted',
            'File changeCompleted',
            'MCP callCompleted',
            'Dynamic callCompleted',
            'Collaboration callCompleted',
            'Web searchCompleted',
            'Image viewCompleted',
            'Claude readCompleted',
        ])
    })

    it('keeps grouped tool details independently expandable', () => {
        const command = toolEvent('Command call', 'commandExecution', 'completed', {
            command: 'npm test',
            content: 'Command output',
            durationMs: 42,
            exitCode: 0,
            workingDirectory: 'C:\\repo',
        })
        const search = toolEvent('Web search', 'webSearch', 'completed', {
            content: 'Search input',
            durationMs: 8,
            output: 'Search output',
        })
        renderChat(conversation('tool-details.json', [command, search], 'codex'))
        const summaryButton = screen.getByRole('button', { name: 'Tools called (2)' })
        fireEvent.click(summaryButton)
        const commandButton = screen.getByRole('button', { name: 'Command details: npm test' })
        const searchButton = screen.getByRole('button', { name: 'Web search details' })

        fireEvent.click(commandButton)

        expect(commandButton).toHaveAttribute('aria-expanded', 'true')
        expect(searchButton).toHaveAttribute('aria-expanded', 'false')
        expect(screen.getByText('Command output')).toBeInTheDocument()
        expect(screen.queryByText('Search output')).not.toBeInTheDocument()

        fireEvent.click(searchButton)

        expect(commandButton).toHaveAttribute('aria-expanded', 'true')
        expect(searchButton).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByText('Search input')).toBeInTheDocument()
        expect(screen.getByText('Search output')).toBeInTheDocument()
        expect(screen.getByText('Working directory').parentElement?.querySelector('pre')?.textContent).toBe('C:\\repo')
        expect(screen.getByText('Exit code: 0')).toBeInTheDocument()
        expect(screen.getByText('Duration: 42 ms')).toBeInTheDocument()
        expect(screen.getByText('Duration: 8 ms')).toBeInTheDocument()

        fireEvent.click(commandButton)

        expect(commandButton).toHaveAttribute('aria-expanded', 'false')
        expect(searchButton).toHaveAttribute('aria-expanded', 'true')
        expect(summaryButton).toHaveAttribute('aria-expanded', 'true')
        expect(screen.queryByText('Command output')).not.toBeInTheDocument()
        expect(screen.getByText('Search output')).toBeInTheDocument()
    })

    it('groups completed calls across textless reasoning and splits them at displayable reasoning', () => {
        const entries: AgentConversationEntry[] = [
            toolEvent('First command', 'commandExecution', 'completed', { command: 'powershell.exe -Command "Get-Content first"' }),
            completedReasoning('first-reasoning'),
            toolEvent('Second command', 'commandExecution', 'completed', { command: 'powershell.exe -Command "Get-Content second"' }),
            { ...completedReasoning('visible-reasoning'), content: 'Visible reasoning' },
            toolEvent('Third command', 'commandExecution', 'completed', { command: 'powershell.exe -Command "Get-Content third"' }),
            completedReasoning('second-reasoning'),
            toolEvent('Fourth command', 'commandExecution', 'completed', { command: 'powershell.exe -Command "Get-Content fourth"' }),
        ]
        renderChat(conversation('tool-boundaries.json', entries, 'codex'))

        const groups = screen.getAllByRole('group', { name: 'Completed tool calls' })
        expect(groups).toHaveLength(2)
        const firstSummary = within(groups[0]).getByRole('button', { name: 'Tools called (2)' })
        const secondSummary = within(groups[1]).getByRole('button', { name: 'Tools called (2)' })
        expect(within(groups[0]).queryByRole('button', { name: /command details/u })).not.toBeInTheDocument()
        expect(within(groups[1]).queryByRole('button', { name: /command details/u })).not.toBeInTheDocument()

        fireEvent.click(firstSummary)
        fireEvent.click(secondSummary)

        expect(within(groups[0]).getAllByRole('button')).toHaveLength(3)
        expect(within(groups[1]).getAllByRole('button')).toHaveLength(3)
        expect(screen.getByRole('button', { name: 'Reasoning details' })).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText('Visible reasoning')).not.toBeInTheDocument()
    })

    it('keeps non-completed tool calls standalone with their lifecycle status', () => {
        const entries = [
            toolEvent('Started call', 'webSearch', 'started'),
            toolEvent('In-progress call', 'mcpToolCall', 'inProgress'),
            toolEvent('Running call', 'dynamicToolCall', 'running'),
            toolEvent('Failed call', 'imageView', 'failed'),
            toolEvent('Declined call', 'collabAgentToolCall', 'declined'),
        ]
        renderChat(conversation('tool-statuses.json', entries, 'codex'))

        expect(screen.queryByRole('group', { name: 'Completed tool calls' })).not.toBeInTheDocument()
        expect(screen.getAllByText('Running')).toHaveLength(3)
        expect(screen.getByText('Failed')).toBeInTheDocument()
        expect(screen.getByText('Declined')).toBeInTheDocument()
    })

    it('appends a newly completed call to an existing group without remounting or duplication', () => {
        const firstCall = toolEvent('First call', 'webSearch')
        const secondCall = toolEvent('Second call', 'mcpToolCall')
        const runningCall = toolEvent('Third call', 'imageView', 'inProgress')
        const first = conversation('tool-lifecycle.json', [
            firstCall,
            completedReasoning('first-live-reasoning'),
            secondCall,
            completedReasoning('second-live-reasoning'),
            runningCall,
        ], 'codex')
        const { rerender } = renderChat(first)
        const summaryButton = screen.getByRole('button', { name: 'Tools called (2)' })
        fireEvent.click(summaryButton)
        const firstButton = screen.getByRole('button', { name: 'First call details' })
        fireEvent.click(firstButton)

        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{
                        ...first,
                        entries: [
                            firstCall,
                            completedReasoning('first-live-reasoning'),
                            secondCall,
                            completedReasoning('second-live-reasoning'),
                            { ...runningCall, status: 'completed' },
                        ],
                    }}
                    status="idle"
                />
            </AppThemeProvider>,
        )

        const group = screen.getByRole('group', { name: 'Completed tool calls' })
        expect(screen.getByRole('button', { name: 'Tools called (3)' })).toBe(summaryButton)
        expect(summaryButton).toHaveAttribute('aria-expanded', 'true')
        const detailButtons = within(group).getAllByRole('button').slice(1)
        expect(detailButtons.map(({ textContent }) => textContent)).toEqual([
            'First callCompleted',
            'Second callCompleted',
            'Third callCompleted',
        ])
        expect(screen.getAllByRole('button', { name: 'First call details' })).toHaveLength(1)
        expect(screen.getByRole('button', { name: 'First call details' })).toBe(firstButton)
        expect(firstButton).toHaveAttribute('aria-expanded', 'true')
    })

    it('keeps one command collapsed and exposes exact final details accessibly', () => {
        const command = 'node -e "console.log(\'héllo\')" \\\n--flag'
        const activity: AgentConversationEvent = {
            command,
            content: 'line one\n[123 characters omitted]\nline two',
            durationMs: 42,
            exitCode: 1,
            id: 'command-completed',
            providerItemId: 'command-1',
            sequence: 2,
            status: 'failed',
            timestamp: 'now',
            type: 'commandExecution',
            workingDirectory: 'C:\\repo',
        }

        renderChat(conversation('codex.json', [{ ...message('message-1', 'Start'), agent: 'codex', sequence: 1 }, eventEntry(activity)], 'codex'))

        const button = screen.getByRole('button', { name: /Command details:/u })
        expect(button).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText(command)).not.toBeInTheDocument()

        fireEvent.click(button)

        expect(button).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByText('Command').parentElement?.querySelector('pre')?.textContent).toBe(command)
        expect(screen.getByText('Output').parentElement?.querySelector('pre')?.textContent)
            .toBe('line one\n[123 characters omitted]\nline two')
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

        renderChat(conversation('codex.json', [{ ...message('message-1', 'Start'), agent: 'codex', sequence: 1 }, eventEntry(activity)], 'codex'))
        const button = screen.getByRole('button', { name: 'Web search details' })
        fireEvent.click(button)

        expect(screen.getByText('Query: Codex schema')).toBeInTheDocument()
        expect(screen.getByText('Result Count: 2')).toBeInTheDocument()
        expect(screen.queryByText(/\{"query"/u)).not.toBeInTheDocument()
    })

    it('hides persisted diagnostics and keeps protocol errors visible with failed styling', () => {
        const diagnostic: AgentConversationEvent = {
            content: 'item/started: futureTool (future-1)\nitem/completed: futureTool (future-1)',
            id: 'diagnostic-1',
            label: 'Codex protocol diagnostic',
            providerItemId: 'diagnostic:future-1:1',
            sequence: 1,
            status: 'completed',
            timestamp: 'now',
            type: 'diagnostic',
        }
        const protocolError: AgentConversationEvent = {
            content: 'message_start missing message id',
            id: 'error-1',
            label: 'Claude protocol error',
            providerItemId: 'error:unknown-message:1',
            sequence: 2,
            status: 'failed',
            timestamp: 'now',
            type: 'error',
        }

        renderChat(conversation('claude.json', [eventEntry(diagnostic), eventEntry(protocolError)], 'claude'))

        expect(screen.queryByRole('button', { name: 'Codex protocol diagnostic details' })).not.toBeInTheDocument()
        expect(screen.queryByText('item/started: futureTool (future-1)')).not.toBeInTheDocument()
        const errorButton = screen.getByRole('button', { name: 'Claude protocol error details' })
        expect(errorButton).toHaveStyle({ color: 'rgb(211, 47, 47)' })
        expect(screen.getByText('Failed')).toBeInTheDocument()
        fireEvent.click(errorButton)
        expect(screen.getByText('message_start missing message id')).toBeInTheDocument()
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

        renderChat(conversation('codex.json', [{ ...message('message-1', 'Start'), sequence: 1 }, eventEntry(activity)]))
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

        renderChat(conversation('claude.json', [{ ...message('message-1', '**Assistant Markdown**'), agent: 'claude', sequence: 1 }, eventEntry(activity)], 'claude'))

        expect(screen.getByText('Assistant Markdown').tagName).toBe('STRONG')
        expect(screen.queryByRole('button', { name: 'Web search details' })).not.toBeInTheDocument()
    })

    it('keeps assistant Markdown and provider completion separators in one balloon', () => {
        renderChat(conversation('codex.json', [{
            ...message('message-1', '**First**\n\nSecond'),
            agent: 'codex',
            sequence: 1,
        }], 'codex'))

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
            [{ ...message('message-1', 'Start'), agent: 'codex', sequence: 1 }, eventEntry(started)],
            'codex',
        )
        const { rerender } = renderChat(first)
        const completed = {
            ...started,
            content: 'passed',
            id: 'command-completed',
            status: 'completed',
        }

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={{
                    ...first, entries: first.entries.map((entry) => (
                        entry.kind === 'event' ? { ...completed, kind: 'event' } as const : entry
                    )),
                }} status="idle" />
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
            providerItemId: 'command-1',
            sequence: 3,
            status: 'inProgress',
            timestamp: 'now',
            type: 'commandExecution',
        }
        const first = conversation(
            'codex.json',
            [
                { ...message('message-1', 'Start'), agent: 'codex', sequence: 1 },
                eventEntry(firstActivity),
                eventEntry(commandActivity),
            ],
            'codex',
        )
        const grown = conversation(
            'codex.json',
            [
                ...first.entries.filter((entry) => entry.kind === 'message'),
                eventEntry(grownActivity),
                eventEntry({ ...commandActivity, content: 'line one\nline two' }),
            ],
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

    it('renders queued prompts after delivered messages in FIFO order with edit and delete controls', async () => {
        const editActionQueuedPrompt = vi.fn(async (_runId, _promptId, _revision, content) => ({content, dispatchState: 'queued' as const, id: 'prompt-1', revision: 1}))
        const deleteActionQueuedPrompt = vi.fn(async () => ({ deleted: true as const }))
        setActionBridgeOverride({ editActionQueuedPrompt, deleteActionQueuedPrompt } as unknown as ElectronActionBridge)
        const value = conversation('first.json', [message('message-1', 'Delivered')])
        render(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={value}
                    queuedPrompts={[
                        { content: 'First queued', dispatchState: 'queued', id: 'prompt-1', revision: 0 },
                        { content: 'Second queued', dispatchState: 'queued', id: 'prompt-2', revision: 0 },
                    ]}
                    runId="run-1"
                    status="running"
                />
            </AppThemeProvider>,
        )
        const rows = screen.getAllByLabelText('Queued prompt')

        expect(rows).toHaveLength(2)
        expect(within(rows[0]).getByText('First queued')).toBeInTheDocument()
        expect(within(rows[1]).getByText('Second queued')).toBeInTheDocument()
        fireEvent.click(within(rows[0]).getByRole('button', { name: 'Edit queued prompt' }))
        fireEvent.change(within(rows[0]).getByRole('textbox', { name: 'Queued prompt content' }), {target: { value: 'Edited first' }})
        fireEvent.click(within(rows[0]).getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(editActionQueuedPrompt).toHaveBeenCalledWith('run-1', 'prompt-1', 0, 'Edited first'))

        fireEvent.click(within(rows[1]).getByRole('button', { name: 'Delete queued prompt' }))
        await waitFor(() => expect(deleteActionQueuedPrompt).toHaveBeenCalledWith('run-1', 'prompt-2', 0))
    })

    it('rejects an empty edit and retains accepted queue state after operation failure', async () => {
        const failure = new Error('Queue operation raced dispatch')
        const editActionQueuedPrompt = vi.fn(async () => {
            throw failure
        })
        const deleteActionQueuedPrompt = vi.fn(async () => {
            throw failure
        })
        setActionBridgeOverride({ editActionQueuedPrompt, deleteActionQueuedPrompt } as unknown as ElectronActionBridge)
        const warning = vi.spyOn(dialogService, 'warning')
        const reportError = vi.spyOn(dialogService, 'error')
        render(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={null}
                    queuedPrompts={[{ content: 'Keep queued', dispatchState: 'queued', id: 'prompt-1', revision: 2 }]}
                    runId="run-1"
                    status="running"
                />
            </AppThemeProvider>,
        )
        const row = screen.getByLabelText('Queued prompt')
        fireEvent.click(within(row).getByRole('button', { name: 'Edit queued prompt' }))
        const editor = within(row).getByRole('textbox', { name: 'Queued prompt content' })
        fireEvent.change(editor, { target: { value: '   ' } })
        fireEvent.click(within(row).getByRole('button', { name: 'Save' }))
        expect(warning).toHaveBeenCalledWith('Queued agent prompt cannot be empty')
        expect(editActionQueuedPrompt).not.toHaveBeenCalled()

        fireEvent.change(editor, { target: { value: 'Failed edit' } })
        fireEvent.click(within(row).getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(reportError).toHaveBeenCalledWith(failure, {fallbackMessage: 'Could not edit queued agent prompt'}))
        expect(editor).toHaveValue('Failed edit')
        fireEvent.click(within(row).getByRole('button', { name: 'Cancel' }))
        expect(within(row).getByText('Keep queued')).toBeInTheDocument()
        fireEvent.click(within(row).getByRole('button', { name: 'Delete queued prompt' }))
        await waitFor(() => expect(reportError).toHaveBeenCalledWith(failure, {fallbackMessage: 'Could not delete queued agent prompt'}))
        expect(within(row).getByText('Keep queued')).toBeInTheDocument()
    })
})

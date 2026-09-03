import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useLayoutEffect, useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
    AgentConversation,
    AgentConversationEntry,
    AgentConversationEvent,
    AgentConversationEventEntry,
    AgentConversationMessageEntry,
} from '../../../data/data_types'
import type { ActionQueuedPrompt } from '../../../data/action_run_types'
import type { ActionConversationChange, ActionRun, ActionRunRegistry } from '../../../services/actions/action_run_registry'
import type { PopupRunStatus } from '../run/popup/action_popup_defaults'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../data/electron_action_bridge'
import { dataService } from '../../../services/data/data_service'
import { dialogService } from '../../../services/dialog_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { AppThemeContext } from '../../../theme/theme_context'
import { useAppTheme } from '../../../theme/use_app_theme'
import { createAppTheme } from '../../../theme/app_theme'
import { MARKDOWN_STYLE_PRESETS } from '../../../theme/theme_config'
import { THEME_MODE_STORAGE_KEY } from '../../../theme/use_theme_settings'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'
import type { ActionConversationStore } from './action_conversation_store'
import { ActionConversationTranscript } from './action_conversation_transcript'
import { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'

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

class TranscriptTestConversationStore extends EventTarget {
    private readonly snapshot = { conversations: [], loading: false, selectedConversation: null }

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }
}

class TranscriptTestBindingStore {
    private readonly listeners = new Set<() => void>()
    private readonly runId: string

    constructor(runId: string) {
        this.runId = runId
    }

    readonly getSnapshot = () => this.runId
    readonly subscribe = (listener: () => void) => {
        this.listeners.add(listener)

        return () => this.listeners.delete(listener)
    }
}

class TranscriptTestRunRegistry {
    private readonly listeners = new Set<() => void>()
    private snapshot: ActionRun

    constructor(snapshot: ActionRun) {
        this.snapshot = snapshot
    }

    getRunStore() {
        return { getSnapshot: () => this.snapshot }
    }

    subscribeRun(_runId: string, listener: () => void) {
        this.listeners.add(listener)

        return () => this.listeners.delete(listener)
    }

    update(snapshot: ActionRun) {
        this.snapshot = snapshot
        for (const listener of this.listeners) listener()
    }

    updateConversation(
        conversationValue: TranscriptTestConversation | null,
        queuedPrompts: ActionQueuedPrompt[],
        runId: string,
        status: PopupRunStatus,
    ) {
        const previousConversation = this.snapshot.conversation
        const changedEntryIndex = conversationValue?.entries.findIndex(
            (entry, index) => entry !== previousConversation?.entries[index],
        ) ?? -1
        const conversationChange = conversationValue?.change
            ?? (previousConversation?.id === conversationValue?.id && changedEntryIndex >= 0
                ? { entryIndex: changedEntryIndex, kind: 'entry' as const }
                : previousConversation === conversationValue ? null : { kind: 'replace' as const })
        this.update({
            ...transcriptTestRun(conversationValue, queuedPrompts, runId, status),
            conversationChange,
        })
    }
}

type TranscriptTestConversation = AgentConversation & { change?: ActionConversationChange }

interface TranscriptTestProps {
    conversation: TranscriptTestConversation | null
    queuedPrompts?: ActionQueuedPrompt[]
    runId?: string | null
    status: PopupRunStatus
}

function transcriptTestRun(
    conversationValue: TranscriptTestConversation | null,
    queuedPrompts: ActionQueuedPrompt[],
    runId: string,
    status: PopupRunStatus,
) {
    return {
        conversation: conversationValue,
        conversationChange: conversationValue?.change ?? { kind: 'replace' },
        queuedPrompts,
        runId,
        status: status === 'idle' ? 'completed' : status,
    } as unknown as ActionRun
}

function ActionConversationChat({ conversation: value, queuedPrompts = [], runId, status }: TranscriptTestProps) {
    const testRunId = runId ?? 'transcript-test-run'
    const [runtime] = useState(() => {
        const registry = new TranscriptTestRunRegistry(transcriptTestRun(value, queuedPrompts, testRunId, status))
        const bindingStore = new TranscriptTestBindingStore(testRunId)
        const store = new TranscriptTestConversationStore()
        const trackerFactory = (nextBindingStore: ActionRunBindingStore, nextStore: ActionConversationStore) => (
            new ActionConversationChatlogTracker(
                nextBindingStore,
                nextStore,
                registry as unknown as ActionRunRegistry,
            )
        )

        return { bindingStore, registry, store, trackerFactory }
    })
    useLayoutEffect(() => {
        runtime.registry.updateConversation(value, queuedPrompts, testRunId, status)
    }, [queuedPrompts, runtime, status, testRunId, value])

    return <ActionConversationTranscript
        bindingStore={runtime.bindingStore as unknown as ActionRunBindingStore}
        store={runtime.store as unknown as ActionConversationStore}
        trackerFactory={runtime.trackerFactory}
    />
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
        window.localStorage.removeItem(THEME_MODE_STORAGE_KEY)
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        restoreProperty('clientHeight', originalClientHeight)
        restoreProperty('scrollHeight', originalScrollHeight)
        restoreProperty('scrollTop', originalScrollTop)
    })

    it('loads tracker after render and unloads it during cleanup', () => {
        const load = vi.spyOn(ActionConversationChatlogTracker.prototype, 'load')
        const unload = vi.spyOn(ActionConversationChatlogTracker.prototype, 'unload')
        const { unmount } = renderChat(conversation('first.json', [message('message-1', 'First')]))

        expect(load).toHaveBeenCalledOnce()
        unmount()
        expect(unload).toHaveBeenCalledOnce()
    })

    it('reports tracker load failure from effect and renders an empty chatlog', () => {
        const failure = new Error('load failed')
        vi.spyOn(ActionConversationChatlogTracker.prototype, 'load').mockImplementationOnce(() => { throw failure })
        const reportError = vi.spyOn(dialogService, 'error').mockReturnValue({
            critical: false,
            id: 1,
            message: failure.message,
            severity: 'error',
            title: 'Error',
        })

        expect(() => renderChat(conversation('first.json', [message('message-1', 'First')]))).not.toThrow()
        expect(reportError).toHaveBeenCalledWith(failure, { fallbackMessage: 'Could not load conversation chatlog' })
        expect(screen.getByLabelText('Conversation chat')).toBeEmptyDOMElement()
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

    it.each(['light', 'dark'] as const)(
        'renders fenced code as a contained theme surface in %s mode without changing inline code',
        (mode) => {
            const longToken = 'https://example.test/one/continuous/path/that/must/remain/inside/the/message/balloon'
            const markdown = [
                'Inline `inlineValue`.',
                '',
                '```text',
                'first line',
                '  indented  columns',
                longToken,
                '```',
            ].join('\n')
            window.localStorage.setItem(THEME_MODE_STORAGE_KEY, mode)
            const { container } = renderChat(conversation('code.json', [message('message-1', markdown)]))
            const blockCode = container.querySelector('pre > code')
            const codeBlock = blockCode?.parentElement
            const theme = createAppTheme(mode)
            const configuredCodeBlock = MARKDOWN_STYLE_PRESETS.modern.codeBlock

            expect(blockCode?.textContent).toContain(`first line\n  indented  columns\n${longToken}`)
            expect(codeBlock).toHaveStyle({
                backgroundColor: theme.palette.background.paper,
                borderColor: theme.palette.divider,
                borderRadius: `${theme.shape.borderRadius}px`,
                borderStyle: 'solid',
                borderWidth: '1px',
                boxSizing: 'border-box',
                maxWidth: '100%',
                overflowWrap: 'anywhere',
                padding: theme.spacing(1),
                whiteSpace: 'pre-wrap',
                width: '100%',
            })
            expect(codeBlock).toHaveStyle({
                fontFamily: configuredCodeBlock.fontFamily,
                fontSize: configuredCodeBlock.fontSize,
                lineHeight: configuredCodeBlock.lineHeight,
                marginBottom: configuredCodeBlock.marginBottom,
                marginTop: configuredCodeBlock.marginTop,
            })
            const inlineCode = screen.getByText('inlineValue')
            expect(inlineCode.parentElement).toHaveProperty('tagName', 'P')
            expect(inlineCode.closest('pre')).toBeNull()
            expect(inlineCode).not.toHaveStyle({ padding: theme.spacing(1) })
            expect(inlineCode).not.toHaveStyle({ borderWidth: '1px' })
        },
    )

    it('renders indented Markdown code with preserved indentation and wrapping styles', () => {
        const markdown = ['Before', '', '    alpha', '      beta  gap', '', 'After'].join('\n')
        const { container } = renderChat(conversation('indented-code.json', [message('message-1', markdown)]))
        const blockCode = container.querySelector('pre > code')

        expect(blockCode?.textContent).toContain('alpha\n  beta  gap')
        expect(blockCode?.parentElement).toHaveStyle({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' })
    })

    it('uses the same block-code presentation for historical and streaming messages', () => {
        const historical = message('message-1', '```text\nhistorical code\n```')
        const user = { ...message('message-2', '```text\nuser code\n```'), role: 'user' as const }
        const streaming = { ...message('message-3', '```text\nstreaming code\n```'), agent: 'codex' }
        const first = conversation('streaming-code.json', [historical, user, streaming], 'codex')
        const { container, rerender } = renderChat(first, 'running')

        expect(container.querySelectorAll('pre')).toHaveLength(3)
        for (const codeBlock of container.querySelectorAll('pre')) {
            expect(codeBlock).toHaveStyle({
                backgroundColor: createAppTheme('light').palette.background.paper,
                overflowWrap: 'anywhere',
                whiteSpace: 'pre-wrap',
            })
        }

        const updatedStreaming = { ...streaming, content: '```text\nstreaming code extended\n```' }
        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={conversation('streaming-code.json', [historical, user, updatedStreaming], 'codex')}
                    status="running"
                />
            </AppThemeProvider>,
        )

        expect(screen.getByText('streaming code extended')).toBeInTheDocument()
        expect(screen.getByText('streaming code extended').parentElement).toHaveStyle({
            overflowWrap: 'anywhere',
            whiteSpace: 'pre-wrap',
        })
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
        expect(screen.queryByRole('group', { name: 'Terminal tool calls' })).not.toBeInTheDocument()
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

        const group = screen.getByRole('group', { name: 'Terminal tool calls' })
        const summaryButton = within(group).getByRole('button', { name: 'Tools called (8)' })
        const summaryText = within(group).getByText('Tools called (8)')
        expect(group).toHaveStyle({ minWidth: '0', overflow: 'hidden' })
        expect(summaryButton).toHaveStyle({ minWidth: '0' })
        expect(summaryText).toHaveStyle({ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
        expect(summaryButton).toHaveAttribute('aria-expanded', 'false')
        expect(within(group).queryByText(/errors:/u)).not.toBeInTheDocument()
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

        const groups = screen.getAllByRole('group', { name: 'Terminal tool calls' })
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

    it('groups mixed terminal outcomes with error count, original order, and error styling', () => {
        const entries = [
            toolEvent('Completed call', 'webSearch', 'completed'),
            toolEvent('Failed call', 'imageView', 'failed'),
            toolEvent('Declined call', 'mcpToolCall', 'declined'),
        ]
        renderChat(conversation('mixed-tool-statuses.json', entries, 'codex'))

        const group = screen.getByRole('group', { name: 'Terminal tool calls' })
        const summaryButton = within(group).getByRole('button', { name: /Tools called \(3\).*errors: 2/u })
        expect(summaryButton).not.toHaveStyle({ color: 'rgb(211, 47, 47)' })

        fireEvent.click(summaryButton)

        const detailButtons = within(group).getAllByRole('button').slice(1)
        expect(detailButtons.map(({ textContent }) => textContent)).toEqual([
            'Completed callCompleted',
            'Failed callFailed',
            'Declined callDeclined',
        ])
        expect(screen.getAllByRole('button', { name: 'Completed call details' })).toHaveLength(1)
        expect(screen.getAllByRole('button', { name: 'Failed call details' })).toHaveLength(1)
        expect(screen.getAllByRole('button', { name: 'Declined call details' })).toHaveLength(1)
        expect(screen.getByRole('button', { name: 'Failed call details' })).toHaveStyle({ color: 'rgb(211, 47, 47)' })
        expect(screen.getByRole('button', { name: 'Declined call details' })).toHaveStyle({ color: 'rgb(211, 47, 47)' })
    })

    it('keeps running and unknown calls standalone and uses them as terminal-group boundaries', () => {
        const entries = [
            toolEvent('First completed', 'webSearch'),
            toolEvent('First failed', 'mcpToolCall', 'failed'),
            toolEvent('Running boundary', 'dynamicToolCall', 'running'),
            toolEvent('Second completed', 'imageView'),
            toolEvent('Second declined', 'fileChange', 'declined'),
            toolEvent('Unknown boundary', 'webSearch', 'unknownStatus'),
        ]
        renderChat(conversation('tool-boundaries.json', entries, 'codex'))

        const groups = screen.getAllByRole('group', { name: 'Terminal tool calls' })
        expect(groups).toHaveLength(2)
        expect(within(groups[0]).getByRole('button', { name: /Tools called \(2\).*errors: 1/u })).toBeInTheDocument()
        expect(within(groups[1]).getByRole('button', { name: /Tools called \(2\).*errors: 1/u })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Running boundary details' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Unknown boundary details' })).toBeInTheDocument()
        expect(screen.getByText('Running')).toBeInTheDocument()
        expect(screen.getByText('unknownStatus')).toBeInTheDocument()
    })

    it('keeps one terminal call standalone', () => {
        renderChat(conversation('single-terminal-tool.json', [
            toolEvent('Only declined call', 'webSearch', 'declined'),
        ], 'codex'))

        expect(screen.queryByRole('group', { name: 'Terminal tool calls' })).not.toBeInTheDocument()
        expect(screen.getByText('Declined')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Only declined call details' })).toBeInTheDocument()
    })

    it('uses terminal grouping and error counts inside a sub-agent', () => {
        const agentCall = toolEvent('Agent call', 'tool.Agent', 'completed', { content: JSON.stringify({ subagent_type: 'Explore' }) })
        const completedCall = toolEvent('Nested completed', 'webSearch', 'completed', { parentItemId: agentCall.providerItemId })
        const failedCall = toolEvent('Nested failed', 'mcpToolCall', 'failed', { parentItemId: agentCall.providerItemId })
        renderChat(conversation('sub-agent-tools.json', [agentCall, completedCall, failedCall], 'codex'))

        fireEvent.click(screen.getByRole('button', { name: 'Explore entries' }))

        const group = screen.getByRole('group', { name: 'Terminal tool calls' })
        const summaryButton = within(group).getByRole('button', { name: /Tools called \(2\).*errors: 1/u })
        fireEvent.click(summaryButton)
        expect(within(group).getByRole('button', { name: 'Nested completed details' })).toBeInTheDocument()
        expect(within(group).getByRole('button', { name: 'Nested failed details' })).toHaveStyle({ color: 'rgb(211, 47, 47)' })
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

        const group = screen.getByRole('group', { name: 'Terminal tool calls' })
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

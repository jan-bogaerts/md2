import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLayoutEffect, useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, AgentConversationEntry } from '../../../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge';
import type { PendingActionSubmission } from '../../../../services/actions/action_run_registry';
import type { ActionQueuedPrompt } from '../../../../data/action_run_types';
import type { ActionRunEvent } from '../../../../data/action_run_types';
import { generateUuid } from '../../../../data/uuid';
import { actionCompactService } from '../../../../services/actions/action_compact_service';
import { actionRunRegistry, type ActionConversationChange, type ActionRun, type ActionRunRegistry } from '../../../../services/actions/action_run_registry'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { projectAccessService } from '../../../../services/project/project_access_service'
import type { ActionRunBindingStore } from '../../run/state/action_run_binding_store'
import type { PopupRunStatus } from '../../run/popup/action_popup_defaults'
import type { ActionConversationStore } from '../state/action_conversation_store'
import { ActionConversationTranscript } from './action_conversation_transcript'
import { ActionConversationSearchService } from '../search/action_conversation_search_service'
import { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker'
import type { ActionConversationCommandOperations } from '../state/action_conversation_command_service'

const commands: ActionConversationCommandOperations = {
    canSaveResponsePhrase: () => false,
    saveAsNewAction: vi.fn(async () => undefined),
    saveAsResponsePhrase: vi.fn(async () => undefined),
    split: vi.fn(async () => undefined),
}

const renderProbes = vi.hoisted(() => ({ event: vi.fn(), markdown: vi.fn() }))

// `ActionConversationChat` observes its viewport, and jsdom ships no ResizeObserver.
function InertResizeObserver() {
    return { disconnect: vi.fn(), observe: vi.fn(), unobserve: vi.fn() }
}

vi.stubGlobal('ResizeObserver', InertResizeObserver)

vi.mock('react-markdown', () => ({
    default: ({ children }: { children: ReactNode }) => {
        renderProbes.markdown(children)

        return <div>{children}</div>
    },
}))

vi.mock('../events/agent_tool_event', () => ({
    AgentToolEvent: () => {
        renderProbes.event()

        return <div>Tool event</div>
    },
}))

function conversation(entries: AgentConversationEntry[]): AgentConversation {
    return {
        actionId: 'review',
        cardInternalId: 'card-1',
        cardPath: 'design/F-138.md',
        completedAt: null,
        entries,
        hasExplicitTitle: false,
        id: 'conversation-1',
        path: 'conversation.json',
        providerSessions: [],
        startedAt: '2026-08-04T10:00:00.000Z',
        status: 'running',
        title: 'Review',
        viewed: true,
    }
}

class TranscriptTestConversationStore extends EventTarget {
    private snapshot = { conversations: [] as AgentConversation[], loading: false, selectedConversation: null as AgentConversation | null }
    readonly actionId = 'review';
    readonly context = { kind: 'project' as const };
    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }

    select(selectedConversation: AgentConversation | null) {
        this.snapshot = { ...this.snapshot, selectedConversation }
        this.dispatchEvent(new Event('changed'))
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
    private submissions: PendingActionSubmission[] = [];
    private readonly submissionEvents = new EventTarget()
    readonly getSubmissions = () => this.submissions
    readonly getVisibleSubmissions = () => this.submissions
    readonly subscribeSubmissions = (_actionId: string, _context: unknown, listener: () => void) => {
        this.submissionEvents.addEventListener('changed', listener)

        return () => this.submissionEvents.removeEventListener('changed', listener)
    }


    setSubmissions(submissions: PendingActionSubmission[]) {
        this.submissions = submissions;
        this.submissionEvents.dispatchEvent(new Event('changed'));
    }


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
        status: PopupRunStatus,
        queuedPrompts: ActionQueuedPrompt[],
    ) {
        const previousConversation = this.snapshot.conversation
        const changedEntryIndex = conversationValue?.entries.findIndex(
            (entry, index) => entry !== previousConversation?.entries[index],
        ) ?? -1
        const conversationChange = conversationValue?.change
            ?? (previousConversation?.id === conversationValue?.id && changedEntryIndex >= 0
                ? { entryIndex: changedEntryIndex, kind: 'entry' as const }
                : previousConversation === conversationValue ? null : { kind: 'replace' as const })
        this.update({ ...transcriptTestRun(conversationValue, status), conversationChange, queuedPrompts });
    }
}

type TranscriptTestConversation = AgentConversation & { change?: ActionConversationChange }

interface TranscriptTestProps {
    commands?: ActionConversationCommandOperations
    conversation: TranscriptTestConversation | null
    selectedConversation?: AgentConversation | null
    submissions?: PendingActionSubmission[];
    queuedPrompts?: ActionQueuedPrompt[];
    status: PopupRunStatus
}

function transcriptTestRun(conversationValue: TranscriptTestConversation | null, status: PopupRunStatus) {
    return {
        conversation: conversationValue,
        conversationChange: conversationValue?.change ?? { kind: 'replace' },
        queuedPrompts: [],
        runId: 'transcript-test-run',
        status: status === 'idle' ? 'completed' : status,
    } as unknown as ActionRun
}

const EMPTY_SUBMISSIONS: PendingActionSubmission[] = [];
const EMPTY_QUEUED_PROMPTS: ActionQueuedPrompt[] = [];

function ActionConversationChat(
    {
        commands: chatCommands = commands, conversation: value, selectedConversation = null,
        submissions = EMPTY_SUBMISSIONS, queuedPrompts = EMPTY_QUEUED_PROMPTS, status,
    }: TranscriptTestProps,
) {
    const [runtime] = useState(() => {
        const registry = new TranscriptTestRunRegistry(transcriptTestRun(value, status))
        const bindingStore = new TranscriptTestBindingStore('transcript-test-run')
        const store = new TranscriptTestConversationStore()
        const trackerFactory = (nextBindingStore: ActionRunBindingStore, nextStore: ActionConversationStore) => (
            new ActionConversationChatlogTracker(
                nextBindingStore,
                nextStore,
                registry as unknown as ActionRunRegistry,
            )
        )

        return { bindingStore, registry, searchService: new ActionConversationSearchService(), store, trackerFactory }
    })
    useLayoutEffect(() => {
        runtime.registry.updateConversation(value, status, queuedPrompts);
    }, [queuedPrompts, runtime, status, value]);
    useLayoutEffect(() => runtime.registry.setSubmissions(submissions), [runtime, submissions]);
    useLayoutEffect(() => {
        runtime.store.select(selectedConversation)
    }, [runtime, selectedConversation])

    return <ActionConversationTranscript
        bindingStore={runtime.bindingStore as unknown as ActionRunBindingStore}
        commands={chatCommands}
        searchService={runtime.searchService}
        store={runtime.store as unknown as ActionConversationStore}
        trackerFactory={runtime.trackerFactory}
    />
}

describe('ActionConversationChat rendering', () => {
    it('keeps the same prompt row mounted before startup and through queued, sending, and sent states', () => {
        const submission: PendingActionSubmission = { content: 'Send this', id: 'submission-1', prompt: null, state: 'transmitting' };
        const { rerender } = render(
            <AppThemeProvider>
                <ActionConversationChat conversation={null} status="running" submissions={[submission]} />
            </AppThemeProvider>,
        );
        const row = screen.getByLabelText('Pending prompt');
        expect(row).toHaveTextContent('In transmission');
        const value = conversation([]);
        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={value} status="running" submissions={[submission]} />
            </AppThemeProvider>,
        );
        expect(screen.getByLabelText('Pending prompt')).toBe(row);
        const queuedPrompt: ActionQueuedPrompt = { content: 'Send this', dispatchState: 'queued', id: submission.id, revision: 0 };
        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={value} status="running" queuedPrompts={[queuedPrompt]}
                    submissions={[{ ...submission, prompt: queuedPrompt, state: 'queued' }]} />
            </AppThemeProvider>,
        );
        expect(screen.getByLabelText('Queued prompt')).toBe(row);
        expect(row).toHaveTextContent('Queued');
        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={value} status="running"
                    queuedPrompts={[{ ...queuedPrompt, dispatchState: 'dispatching' }]}
                    submissions={[{ ...submission, prompt: queuedPrompt, state: 'queued' }]} />
            </AppThemeProvider>,
        );
        expect(screen.getByLabelText('Queued prompt')).toBe(row);
        expect(row).toHaveTextContent('Sending');
        expect(screen.getByRole('button', { name: 'Edit queued prompt' })).toBeDisabled();
        const sentMessage = { content: 'Send this', id: submission.id, kind: 'message' as const, role: 'user' as const, timestamp: 'now' };
        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={{ ...value, entries: [sentMessage] }} status="running" />
            </AppThemeProvider>,
        );
        expect(row).toBeInTheDocument();
        expect(screen.getByText('Send this').closest('.conversation-message')).toBe(row);
        expect(screen.queryByLabelText('Pending prompt')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Queued prompt')).not.toBeInTheDocument();
        expect(screen.getAllByText('Send this')).toHaveLength(1);
    });

    it('keeps queued prompt editing and deletion on the current-turn row', async () => {
        const user = userEvent.setup();
        const queuedPrompt: ActionQueuedPrompt = { content: 'Original', dispatchState: 'queued', id: 'queued-1', revision: 0 };
        const editPrompt = vi.fn(async () => queuedPrompt);
        const deletePrompt = vi.fn(async () => undefined);
        const bridge = { editActionQueuedPrompt: editPrompt, deleteActionQueuedPrompt: deletePrompt, onActionRun: vi.fn(() => vi.fn()) };
        setActionBridgeOverride(bridge as unknown as ElectronActionBridge);
        const value = conversation([]);
        const { rerender } = render(
            <AppThemeProvider>
                <ActionConversationChat conversation={value} status="running" queuedPrompts={[queuedPrompt]} />
            </AppThemeProvider>,
        );
        const row = screen.getByLabelText('Queued prompt');
        await user.click(screen.getByRole('button', { name: 'Edit queued prompt' }));
        await user.clear(screen.getByRole('textbox', { name: 'Queued prompt content' }));
        await user.type(screen.getByRole('textbox', { name: 'Queued prompt content' }), 'Updated');
        await user.click(screen.getByRole('button', { name: 'Save' }));
        expect(editPrompt).toHaveBeenCalledWith('transcript-test-run', queuedPrompt.id, 0, 'Updated');
        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={value} status="running"
                    queuedPrompts={[{ ...queuedPrompt, content: 'Updated', revision: 1 }]} />
            </AppThemeProvider>,
        );
        expect(screen.getByLabelText('Queued prompt')).toBe(row);
        expect(row).toHaveTextContent('Updated');
        await user.click(screen.getByRole('button', { name: 'Delete queued prompt' }));
        expect(deletePrompt).toHaveBeenCalledWith('transcript-test-run', queuedPrompt.id, 1);
        rerender(<AppThemeProvider><ActionConversationChat conversation={value} status="running" /></AppThemeProvider>);
        expect(row).not.toBeInTheDocument();
    });

    it('keeps a failed submission on the same row and displays its error', () => {
        const submission: PendingActionSubmission = { content: 'Send this', id: 'submission-1', prompt: null, state: 'transmitting' };
        const { rerender } = render(
            <AppThemeProvider><ActionConversationChat conversation={null} status="running" submissions={[submission]} /></AppThemeProvider>,
        );
        const row = screen.getByLabelText('Pending prompt');
        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={null} status="running"
                    submissions={[{ ...submission, error: 'Backend rejected the prompt', state: 'failed' }]} />
            </AppThemeProvider>,
        );
        expect(screen.getByLabelText('Pending prompt')).toBe(row);
        expect(row).toHaveTextContent('Failed to send');
        expect(row).toHaveTextContent('Backend rejected the prompt');
    });

    it('shows compact progress inside the chat without repainting transcript messages', () => {
        const displayed = { ...conversation([{ content: 'Keep transcript', id: 'message-1', kind: 'message', role: 'assistant', timestamp: 'now' }]), id: generateUuid() };
        render(<AppThemeProvider><ActionConversationChat conversation={displayed} status="running" /></AppThemeProvider>);
        const event: ActionRunEvent = {
            actionId: 'review', context: { kind: 'project' }, phase: 'main', rootActionId: 'review', runId: 'compact-run',
            status: 'running', type: 'update', update: {
                kind: 'agentCompact', request: {
                    actionId: 'review', context: { kind: 'project' }, conversationId: displayed.id, provider: 'codex',
                    reference: displayed.path, requestId: generateUuid(), state: 'running',
                },
            },
        };
        if (event.update.kind !== 'agentCompact') throw new Error('Expected compact fixture');
        renderProbes.markdown.mockClear();
        act(() => actionCompactService.handleEvent(event));
        expect(within(screen.getByLabelText('Conversation chat')).getByRole('progressbar', { name: 'Compacting conversation' })).toBeInTheDocument();
        expect(screen.getByText('Keep transcript')).toBeInTheDocument();
        expect(renderProbes.markdown).not.toHaveBeenCalled();
        const completed: ActionRunEvent = { ...event, update: { kind: 'agentCompact', request: { ...event.update.request, state: 'completed' } } };
        act(() => actionCompactService.handleEvent(completed));
        expect(screen.queryByRole('progressbar', { name: 'Compacting conversation' })).not.toBeInTheDocument();
    });

    afterEach(() => {
        cleanup()
        projectAccessService.setReadOnly(false)
        vi.clearAllMocks()
        actionRunRegistry.stop();
        setActionBridgeOverride(null);
    })

    it('enables every mounted Split control when a previously split source starts waiting', async () => {
        const firstMessage = { content: 'First', id: 'message-1', kind: 'message' as const, role: 'user' as const, timestamp: 'now' }
        const secondMessage = { content: 'Second', id: 'message-2', kind: 'message' as const, role: 'assistant' as const, timestamp: 'now' }
        const running = { ...conversation([firstMessage, secondMessage]), title: 'Review (split)' }
        const waiting = { ...running, status: 'waitingForInput' as const }
        const split = vi.fn(async () => undefined)
        const chatCommands = { ...commands, split }
        const { rerender } = render(
            <AppThemeProvider><ActionConversationChat commands={chatCommands} conversation={running} status="running" /></AppThemeProvider>,
        )
        expect(screen.getAllByRole('button', { name: 'Split conversation here' })).toHaveLength(2)
        for (const button of screen.getAllByRole('button', { name: 'Split conversation here' })) expect(button).toBeDisabled()
        renderProbes.markdown.mockClear()

        rerender(
            <AppThemeProvider><ActionConversationChat commands={chatCommands} conversation={waiting} status="waitingForInput" /></AppThemeProvider>,
        )

        for (const button of screen.getAllByRole('button', { name: 'Split conversation here' })) expect(button).toBeEnabled()
        expect(renderProbes.markdown).not.toHaveBeenCalled()
        await userEvent.click(screen.getAllByRole('button', { name: 'Split conversation here' })[1])
        expect(split).toHaveBeenCalledWith(waiting, secondMessage)
    })

    it('uses status of displayed conversation when switching between live and history', () => {
        const liveMessage = { content: 'Live', id: 'live-message', kind: 'message' as const, role: 'user' as const, timestamp: 'now' }
        const historyMessage = { content: 'History', id: 'history-message', kind: 'message' as const, role: 'user' as const, timestamp: 'now' }
        const live = conversation([liveMessage])
        const historical = { ...conversation([historyMessage]), id: 'historical', status: 'waitingForInput' as const }
        const { rerender } = render(
            <AppThemeProvider><ActionConversationChat conversation={live} status="running" /></AppThemeProvider>,
        )
        expect(screen.getByRole('button', { name: 'Split conversation here' })).toBeDisabled()

        rerender(
            <AppThemeProvider>
                <ActionConversationChat conversation={live} selectedConversation={historical} status="running" />
            </AppThemeProvider>,
        )
        expect(screen.getByText('History')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Split conversation here' })).toBeEnabled()

        rerender(
            <AppThemeProvider><ActionConversationChat conversation={live} status="running" /></AppThemeProvider>,
        )
        expect(screen.getByText('Live')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Split conversation here' })).toBeDisabled()
    })

    it('updates a stable entry after terminal rendering without throwing', () => {
        const user = {content: 'Question', id: 'message-1', kind: 'message' as const, role: 'user' as const, timestamp: 'now'}
        const assistant = {content: 'Initial', id: 'message-2', kind: 'message' as const, role: 'assistant' as const, timestamp: 'now'}
        const initialConversation = { ...conversation([user, assistant]), status: 'completed' as const }
        const { rerender } = render(
            <AppThemeProvider>
                <ActionConversationChat conversation={initialConversation} status="completed" />
            </AppThemeProvider>,
        )

        expect(() => rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{
                        ...initialConversation,
                        change: { entryIndex: 1, kind: 'entry' },
                        entries: [user, { ...assistant, content: 'Recovered' }],
                    }}
                    status="completed"
                />
            </AppThemeProvider>,
        )).not.toThrow()
        expect(screen.getByText('Recovered')).toBeInTheDocument()
    })

    it('rerenders only changed entries while assistant output streams', () => {
        const historicalMessage = {content: 'Historical', id: 'message-1', kind: 'message' as const, role: 'assistant' as const, timestamp: 'now'}
        const toolEvent = {
            content: '', id: 'event-1', kind: 'event' as const, providerItemId: 'tool-1', status: 'completed',
            timestamp: 'now', type: 'tool',
        }
        const streamingMessage = {content: 'Live', id: 'message-2', kind: 'message' as const, role: 'assistant' as const, timestamp: 'now'}
        const firstConversation = conversation([historicalMessage, toolEvent, streamingMessage])
        const { rerender } = render(
            <AppThemeProvider>
                <ActionConversationChat conversation={{ ...firstConversation, change: { kind: 'replace' } }} status="running" />
            </AppThemeProvider>,
        )
        renderProbes.markdown.mockClear()
        renderProbes.event.mockClear()

        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{
                        ...firstConversation,
                        change: { entryIndex: 2, kind: 'entry' },
                        entries: [historicalMessage, toolEvent, { ...streamingMessage, content: 'Live update' }],
                    }}
                    status="running"
                />
            </AppThemeProvider>,
        )

        expect(renderProbes.markdown).toHaveBeenCalledOnce()
        expect(renderProbes.markdown).toHaveBeenCalledWith('Live update')
        expect(renderProbes.event).not.toHaveBeenCalled()
    })

    it('does not rerender unchanged grouped tool rows while assistant output streams', () => {
        const historicalMessage = {content: 'Historical', id: 'message-1', kind: 'message' as const, role: 'assistant' as const, timestamp: 'now'}
        const firstTool = {
            content: '', id: 'event-1', kind: 'event' as const, providerItemId: 'tool-1', status: 'completed',
            timestamp: 'now', type: 'webSearch',
        }
        const secondTool = {
            content: '', id: 'event-2', kind: 'event' as const, providerItemId: 'tool-2', status: 'completed',
            timestamp: 'now', type: 'mcpToolCall',
        }
        const streamingMessage = {content: 'Live', id: 'message-2', kind: 'message' as const, role: 'assistant' as const, timestamp: 'now'}
        const firstConversation = conversation([historicalMessage, firstTool, secondTool, streamingMessage])
        const { rerender } = render(
            <AppThemeProvider>
                <ActionConversationChat conversation={{ ...firstConversation, change: { kind: 'replace' } }} status="running" />
            </AppThemeProvider>,
        )
        renderProbes.markdown.mockClear()
        renderProbes.event.mockClear()

        rerender(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={{
                        ...firstConversation,
                        change: { entryIndex: 3, kind: 'entry' },
                        entries: [historicalMessage, firstTool, secondTool, { ...streamingMessage, content: 'Live update' }],
                    }}
                    status="running"
                />
            </AppThemeProvider>,
        )

        expect(renderProbes.markdown).toHaveBeenCalledOnce()
        expect(renderProbes.markdown).toHaveBeenCalledWith('Live update')
        expect(renderProbes.event).not.toHaveBeenCalled()
    })

    it('collapses sub-agent entries under the Agent call that spawned them', () => {
        const agentCall = {
            content: JSON.stringify({ subagent_type: 'Explore' }), id: 'event-1', kind: 'event' as const,
            providerItemId: 'agent-1', status: 'completed', timestamp: 'now', type: 'tool.Agent',
        }
        const subAgentText = {
            content: 'sub output', id: 'event-2', kind: 'event' as const, label: 'Explore', parentItemId: 'agent-1',
            providerItemId: 'agent-1:message-sub:text:0', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation([agentCall, subAgentText])} status="running" />
            </AppThemeProvider>,
        )

        const group = screen.getByRole('group', { name: 'Sub agent Explore' })
        const toggle = screen.getByRole('button', { expanded: false })

        expect(toggle).toHaveTextContent('Explore (1)')
        expect(screen.getAllByText('Tool event')).toHaveLength(1)

        fireEvent.click(toggle)

        expect(group).toBeInTheDocument()
        expect(screen.getAllByText('Tool event')).toHaveLength(2)
    })

    it('groups non-consecutive sub-agent entries while keeping root transcript order', () => {
        const agentCall = {
            content: JSON.stringify({ subagent_type: 'Explore' }), id: 'event-1', kind: 'event' as const,
            providerItemId: 'agent-1', status: 'completed', timestamp: 'now', type: 'tool.Agent',
        }
        const firstSubAgentText = {
            content: 'first output', id: 'event-2', kind: 'event' as const, label: 'Explore', parentItemId: 'agent-1',
            providerItemId: 'agent-1:message-sub:text:0', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        const parentMessage = {content: 'parent output', id: 'message-1', kind: 'message' as const, role: 'assistant' as const, timestamp: 'now'}
        const laterSubAgentText = {
            content: 'later output', id: 'event-3', kind: 'event' as const, label: 'Explore', parentItemId: 'agent-1',
            providerItemId: 'agent-1:message-sub:text:1', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={conversation([agentCall, firstSubAgentText, parentMessage, laterSubAgentText])}
                    status="running"
                />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('button', { name: 'Explore entries' })).toHaveTextContent('Explore (2)')
        expect(screen.getByText('parent output')).toBeInTheDocument()
        expect(screen.getAllByText('Tool event')).toHaveLength(1)
    })

    it('uses sub-agent message label when spawning input is incomplete', () => {
        const agentCall = {
            content: '{', id: 'event-1', kind: 'event' as const,
            providerItemId: 'agent-1', status: 'inProgress', timestamp: 'now', type: 'tool.Agent',
        }
        const reasoning = {
            content: 'thinking', id: 'event-2', kind: 'event' as const, label: 'Thinking', parentItemId: 'agent-1',
            providerItemId: 'agent-1:thinking', status: 'completed', timestamp: 'now', type: 'reasoning',
        }
        const subAgentText = {
            content: 'output', id: 'event-3', kind: 'event' as const, label: 'Explore', parentItemId: 'agent-1',
            providerItemId: 'agent-1:text', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation([agentCall, reasoning, subAgentText])} status="running" />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('group', { name: 'Sub agent Explore' })).toBeInTheDocument()
    })

    it('nests a second-level sub agent under its own spawning Agent call', () => {
        const agentCall = {
            content: JSON.stringify({ subagent_type: 'Explore' }), id: 'event-1', kind: 'event' as const,
            providerItemId: 'agent-1', status: 'completed', timestamp: 'now', type: 'tool.Agent',
        }
        const nestedAgentCall = {
            content: JSON.stringify({ subagent_type: 'Plan' }), id: 'event-2', kind: 'event' as const,
            parentItemId: 'agent-1', providerItemId: 'agent-2', status: 'completed', timestamp: 'now', type: 'tool.Agent',
        }
        const nestedText = {
            content: 'nested output', id: 'event-3', kind: 'event' as const, label: 'Plan', parentItemId: 'agent-2',
            providerItemId: 'agent-2:message-nested:text:0', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation([agentCall, nestedAgentCall, nestedText])} status="running" />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Explore entries' }))

        expect(screen.getByRole('group', { name: 'Sub agent Plan' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Plan entries' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('renders a sub-agent entry flat when its spawning Agent call never arrived', () => {
        const orphan = {
            content: 'sub output', id: 'event-1', kind: 'event' as const, label: 'Explore', parentItemId: 'agent-missing',
            providerItemId: 'agent-missing:message-sub:text:0', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation([orphan])} status="running" />
            </AppThemeProvider>,
        )

        expect(screen.queryByRole('group')).not.toBeInTheDocument()
        expect(screen.getAllByText('Tool event')).toHaveLength(1)
    })

    it('collapses Codex child-thread entries under the collaboration call with a running count', () => {
        const collaborationCall = {
            content: 'investigate', id: 'event-1', kind: 'event' as const, label: 'Collaboration: wait',
            providerItemId: 'wait-1', runningSubThreads: 2, status: 'inProgress', timestamp: 'now',
            type: 'collabAgentToolCall',
        }
        const childToolCall = {
            content: '', id: 'event-2', kind: 'event' as const, label: 'search', parentItemId: 'wait-1',
            providerItemId: 'child-tool', status: 'completed', timestamp: 'now', type: 'mcpToolCall',
        }
        const childMessage = {
            content: 'found it', id: 'event-3', kind: 'event' as const, label: 'wait', parentItemId: 'wait-1',
            providerItemId: 'child-message', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={conversation([collaborationCall, childToolCall, childMessage])}
                    status="running"
                />
            </AppThemeProvider>,
        )

        const toggle = screen.getByRole('button', { name: 'Collaboration: wait entries' })

        expect(screen.getByRole('group', { name: 'Sub agent Collaboration: wait' })).toBeInTheDocument()
        expect(toggle).toHaveTextContent('Collaboration: wait (2) — 2 running')
        expect(screen.getAllByText('Tool event')).toHaveLength(1)

        fireEvent.click(toggle)

        expect(screen.getAllByText('Tool event')).toHaveLength(3)
    })

    it('keeps interleaved root entries outside the Codex child-thread group', () => {
        const collaborationCall = {
            content: 'investigate', id: 'event-1', kind: 'event' as const, label: 'Collaboration: wait',
            providerItemId: 'wait-1', runningSubThreads: 1, status: 'inProgress', timestamp: 'now',
            type: 'collabAgentToolCall',
        }
        const rootMessage = {
            agent: 'codex', content: 'Root update', id: 'message-1', kind: 'message' as const,
            role: 'assistant' as const, timestamp: 'now',
        }
        const childMessage = {
            content: 'Child update', id: 'event-2', kind: 'event' as const, label: 'wait', parentItemId: 'wait-1',
            providerItemId: 'child-message', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={conversation([collaborationCall, rootMessage, childMessage])}
                    status="running"
                />
            </AppThemeProvider>,
        )

        expect(screen.getByText('Root update')).toBeInTheDocument()
        expect(screen.getAllByText('Tool event')).toHaveLength(1)

        fireEvent.click(screen.getByRole('button', { name: 'Collaboration: wait entries' }))

        expect(screen.getAllByText('Tool event')).toHaveLength(2)
    })

    it('shows a running Codex child-thread group before the child emits visible output', () => {
        const collaborationCall = {
            content: 'investigate', id: 'event-1', kind: 'event' as const, label: 'Collaboration: wait',
            providerItemId: 'wait-1', runningSubThreads: 2, status: 'inProgress', timestamp: 'now',
            type: 'collabAgentToolCall',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation([collaborationCall])} status="running" />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('button', { name: 'Collaboration: wait entries' }))
            .toHaveTextContent('Collaboration: wait (0) — 2 running')
    })

    it('drops the running count once the collaboration call completes', () => {
        const collaborationCall = {
            content: 'investigate', id: 'event-1', kind: 'event' as const, label: 'Collaboration: wait',
            providerItemId: 'wait-1', runningSubThreads: 0, status: 'completed', timestamp: 'now',
            type: 'collabAgentToolCall',
        }
        const childMessage = {
            content: 'found it', id: 'event-2', kind: 'event' as const, label: 'wait', parentItemId: 'wait-1',
            providerItemId: 'child-message', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation([collaborationCall, childMessage])} status="running" />
            </AppThemeProvider>,
        )

        const toggle = screen.getByRole('button', { name: 'Collaboration: wait entries' })

        expect(toggle).toHaveTextContent('Collaboration: wait (1)')
        expect(toggle.textContent).not.toContain('running')
    })

    it('nests a collaboration call made inside a child thread under that child entry', () => {
        const collaborationCall = {
            content: '', id: 'event-1', kind: 'event' as const, label: 'Collaboration: wait',
            providerItemId: 'wait-1', status: 'inProgress', timestamp: 'now', type: 'collabAgentToolCall',
        }
        const nestedCollaborationCall = {
            content: '', id: 'event-2', kind: 'event' as const, label: 'Collaboration: ask', parentItemId: 'wait-1',
            providerItemId: 'wait-2', status: 'inProgress', timestamp: 'now', type: 'collabAgentToolCall',
        }
        const grandchildMessage = {
            content: 'deep', id: 'event-3', kind: 'event' as const, label: 'ask', parentItemId: 'wait-2',
            providerItemId: 'grandchild-message', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat
                    conversation={conversation([collaborationCall, nestedCollaborationCall, grandchildMessage])}
                    status="running"
                />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Collaboration: wait entries' }))

        expect(screen.getByRole('group', { name: 'Sub agent Collaboration: ask' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Collaboration: ask entries' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('renders a child-thread entry flat when its collaboration call never arrived', () => {
        const orphan = {
            content: 'found it', id: 'event-1', kind: 'event' as const, label: 'wait', parentItemId: 'wait-missing',
            providerItemId: 'child-message', status: 'completed', timestamp: 'now', type: 'agentMessage',
        }
        render(
            <AppThemeProvider>
                <ActionConversationChat conversation={conversation([orphan])} status="running" />
            </AppThemeProvider>,
        )

        expect(screen.queryByRole('group')).not.toBeInTheDocument()
        expect(screen.getAllByText('Tool event')).toHaveLength(1)
    })
})

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentConversation } from '../../../../data/data_types';
import type { ActionContext } from '../../../../data/action_context';
import type { ActionCompactRequest, ActionCompactState, ActionRunEvent } from '../../../../data/action_run_types';
import { generateUuid } from '../../../../data/uuid';
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge';
import { ActionPromptDraft } from '../../../../services/actions/action_prompt_draft_service';
import { actionRunRegistry } from '../../../../services/actions/action_run_registry';
import { actionCompactService } from '../../../../services/actions/action_compact_service';
import { attachFilesToCardMarkdown, attachFilesToOriginalMarkdown } from '../../../../services/attachments/attachment_workflow';
import { dialogService } from '../../../../services/dialog_service';
import { AppThemeProvider } from '../../../../theme/theme_provider';
import { ActionConversationStore } from '../../conversation/state/action_conversation_store';
import { ActionRunBindingStore } from '../state/action_run_binding_store';
import { ActionPromptMenu } from './action_prompt_menu';

vi.mock('../../../../services/attachments/attachment_workflow', () => ({attachFilesToCardMarkdown: vi.fn(async () => undefined), attachFilesToOriginalMarkdown: vi.fn(async () => undefined)}));

const context = { kind: 'project' as const };

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
    return { promise, resolve };
}

function conversation(id = 'conversation-1'): AgentConversation {
    return {
        actionId: 'review', cardInternalId: null, cardPath: null, completedAt: null,
        entries: [{ content: 'Original transcript', id: 'message-1', kind: 'message', role: 'assistant', timestamp: '2026-01-01' }],
        hasExplicitTitle: true, id, path: `activity.json#conversation=${id}`,
        providerSessions: [{
            agent: 'codex', conversationId: 'session-1', createdAt: '2026-01-01', lastUsedAt: '2026-01-01',
            synchronizedThroughMessageId: 'message-1',
        }],
        startedAt: '2026-01-01', status: 'waitingForInput', title: 'Review', viewed: true,
    };
}

function renderMenu(hasConversation = true, cardFile?: string, conversationId = 'conversation-1') {
    const menuContext: ActionContext = cardFile ? { cardInternalId: 'card-1', file: cardFile, kind: 'card' } : context;
    const bindingStore = new ActionRunBindingStore(null);
    const conversationStore = new ActionConversationStore('review', menuContext, bindingStore);
    if (hasConversation) {
        conversationStore.addAndSelectConversation({ ...conversation(conversationId), cardInternalId: menuContext.cardInternalId ?? null });
    }
    const promptDraft = new ActionPromptDraft('Keep draft and ![attachment](asset.png)', false);
    const rendered = render(
        <AppThemeProvider>
            <ActionPromptMenu
                actionId="review" bindingStore={bindingStore} context={menuContext}
                conversationStore={conversationStore} promptDraft={promptDraft}
            />
        </AppThemeProvider>,
    );
    return { ...rendered, conversationStore, promptDraft };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(dialogService, 'error').mockReturnValue({ critical: false, id: 1, message: 'Failure', severity: 'error', title: 'Error' });
});

afterEach(() => {
    cleanup();
    setActionBridgeOverride(null);
    actionCompactService.connect();
    actionRunRegistry.stop();
    vi.restoreAllMocks();
});

describe('ActionPromptMenu', () => {
    it.each(['completed', 'failed'] as const)('disables Compact while running, then enables it after %s without a subline', async (state) => {
        const conversationId = generateUuid();
        const { conversationStore } = renderMenu(true, undefined, conversationId);
        const event: ActionRunEvent = {
            actionId: 'review', context, phase: 'main', rootActionId: 'review', runId: 'compact-menu-run',
            status: 'running', type: 'update', update: {
                kind: 'agentCompact', request: {
                    actionId: 'review', context, conversationId, provider: 'codex', reference: conversation(conversationId).path,
                    requestId: generateUuid(), state: 'running',
                },
            },
        };
        if (event.update.kind !== 'agentCompact') throw new Error('Expected compact fixture');
        act(() => actionCompactService.handleEvent(event));
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'Prompt menu' }));
        const compactItem = screen.getByRole('menuitem', { name: 'Compact' });
        expect(compactItem).toHaveAttribute('aria-disabled', 'true');
        expect(compactItem).toHaveTextContent(/^Compact$/u);
        expect(screen.getByRole('menuitem', { name: 'Add file' })).not.toHaveAttribute('aria-disabled', 'true');
        act(() => conversationStore.addAndSelectConversation(conversation(generateUuid())));
        expect(compactItem).not.toHaveAttribute('aria-disabled', 'true');
        act(() => conversationStore.addAndSelectConversation(conversation(conversationId)));
        expect(compactItem).toHaveAttribute('aria-disabled', 'true');
        const settled: ActionRunEvent = {...event, update: { kind: 'agentCompact', request: { ...event.update.request, state, message: 'Context compacted' } }};
        act(() => actionCompactService.handleEvent(settled));
        expect(compactItem).not.toHaveAttribute('aria-disabled', 'true');
        expect(compactItem).toHaveTextContent(/^Compact$/u);
        expect(screen.queryByText(/Context compacted/u)).not.toBeInTheDocument();
    });

    it('shows only queued requests for the displayed conversation on the closed menu button', () => {
        const conversationId = generateUuid();
        const { conversationStore } = renderMenu(true, undefined, conversationId);
        const event: ActionRunEvent = {
            actionId: 'review', context, phase: 'main', rootActionId: 'review', runId: 'queue-run',
            status: 'running', type: 'update', update: {
                kind: 'agentCompact', request: {
                    actionId: 'review', context, conversationId, provider: 'codex', reference: conversation(conversationId).path,
                    requestId: `${conversationId}-1`, state: 'queued',
                },
            },
        };
        if (event.update.kind !== 'agentCompact') throw new Error('Expected compact fixture');
        const request = event.update.request;
        act(() => {
            actionCompactService.handleEvent(event);
            actionCompactService.handleEvent({ ...event, update: { kind: 'agentCompact', request: { ...request, requestId: `${conversationId}-2` } } });
        });
        expect(screen.getByLabelText('2 compact requests queued')).toHaveTextContent('2');
        act(() => actionCompactService.handleEvent({ ...event, update: { kind: 'agentCompact', request: { ...request, state: 'running' } } }));
        expect(screen.getByLabelText('1 compact request queued')).toHaveTextContent('1');
        act(() => conversationStore.addAndSelectConversation(conversation('other-badge-conversation')));
        expect(screen.queryByLabelText(/compact requests queued/u)).not.toBeInTheDocument();
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('binds resumed saved conversation for later input without clearing its draft', async () => {
        let emit!: (event: ActionRunEvent) => void;
        const compact = vi.fn(async (request: ActionCompactRequest): Promise<ActionCompactState> => {
            emit({
                actionId: 'review', actionType: 'agent', context, phase: 'main', rootActionId: 'review', runId: 'resumed-run',
                status: 'waitingForInput', type: 'update',
                update: { conversation: conversation('resumed-conversation'), kind: 'agentStarted', provider: 'codex' },
            });
            return { ...request, runId: 'resumed-run', state: 'running' };
        });
        const bridge = {
            compactActionConversation: compact,
            onActionRun: vi.fn((listener: (event: ActionRunEvent) => void) => { emit = listener; return vi.fn(); }),
        } as unknown as ElectronActionBridge;
        setActionBridgeOverride(bridge);
        const user = userEvent.setup();
        const { conversationStore, promptDraft } = renderMenu(true, undefined, 'resumed-conversation');
        await user.click(screen.getByRole('button', { name: 'Prompt menu' }));
        await user.click(screen.getByRole('menuitem', { name: 'Compact' }));
        await waitFor(() => expect(conversationStore.bindingStore.getSnapshot()).toBe('resumed-run'));
        expect(promptDraft.getSnapshot()).toBe('Keep draft and ![attachment](asset.png)');
    });

    it('offers Compact before Add file and supports keyboard navigation and Escape dismissal', async () => {
        const user = userEvent.setup();
        renderMenu();
        await user.tab();
        expect(screen.getByRole('button', { name: 'Prompt menu' })).toHaveFocus();
        await user.keyboard('{Enter}');
        const items = screen.getAllByRole('menuitem');
        expect(items.map((item) => item.textContent)).toEqual(['Compact', 'Add file']);
        expect(items[0]).toHaveFocus();
        await user.keyboard('{ArrowDown}');
        expect(items[1]).toHaveFocus();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Prompt menu' })).toHaveFocus();
    });

    it('captures displayed conversation, preserves draft, and keeps accepted work after selection changes or popup closes', async () => {
        const accepted = deferred<ActionCompactState>();
        const compact = vi.fn<(request: ActionCompactRequest) => Promise<ActionCompactState>>(async () => accepted.promise);
        const bridge = { compactActionConversation: compact, onActionRun: vi.fn(() => vi.fn()) } as unknown as ElectronActionBridge;
        setActionBridgeOverride(bridge);
        const user = userEvent.setup();
        const { conversationStore, promptDraft, unmount } = renderMenu();
        await user.click(screen.getByRole('button', { name: 'Prompt menu' }));
        await user.click(screen.getByRole('menuitem', { name: 'Compact' }));
        expect(compact).toHaveBeenCalledWith(expect.objectContaining({conversationId: 'conversation-1', provider: 'codex', reference: 'activity.json#conversation=conversation-1'}));
        const captured = compact.mock.calls[0][0];
        act(() => conversationStore.addAndSelectConversation(conversation('conversation-2')));
        expect(promptDraft.getSnapshot()).toBe('Keep draft and ![attachment](asset.png)');
        unmount();
        accepted.resolve({ ...captured, state: 'queued' });
        await act(async () => { await accepted.promise; });
        expect(compact).toHaveBeenCalledTimes(1);
    });

    it.each([undefined, 'design/card.md'])('preserves multi-file picking and draft insertion workflow for %s', async (cardFile) => {
        const user = userEvent.setup();
        const { promptDraft } = renderMenu(false, cardFile);
        await user.click(screen.getByRole('button', { name: 'Prompt menu' }));
        await user.click(screen.getByRole('menuitem', { name: 'Add file' }));
        const files = [new File(['one'], 'one.txt'), new File(['two'], 'two.txt')];
        await user.upload(screen.getByLabelText('Add files'), files);
        if (cardFile) expect(attachFilesToCardMarkdown).toHaveBeenCalledWith(cardFile, files, promptDraft.requestInsertion);
        else expect(attachFilesToOriginalMarkdown).toHaveBeenCalledWith(files, promptDraft.requestInsertion);
        expect(screen.getByLabelText('Add files')).toHaveValue('');
    });

    it('picker cancellation changes nothing and Compact reports missing history', async () => {
        const user = userEvent.setup();
        const { promptDraft } = renderMenu(false);
        await user.click(screen.getByRole('button', { name: 'Prompt menu' }));
        await user.click(screen.getByRole('menuitem', { name: 'Add file' }));
        await user.upload(screen.getByLabelText('Add files'), []);
        expect(attachFilesToOriginalMarkdown).not.toHaveBeenCalled();
        expect(promptDraft.getSnapshot()).toBe('Keep draft and ![attachment](asset.png)');
        await user.click(screen.getByRole('button', { name: 'Prompt menu' }));
        await user.click(screen.getByRole('menuitem', { name: 'Compact' }));
        expect(dialogService.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'There is nothing to compact' }), expect.any(Object));
    });
});

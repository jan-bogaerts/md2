import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionCompactState, ActionRunEvent } from '../../../../data/action_run_types';
import { generateUuid } from '../../../../data/uuid';
import { actionCompactService } from '../../../../services/actions/action_compact_service';
import { dialogService } from '../../../../services/dialog_service';
import { ActionConversationCompactProgress } from './action_conversation_compact_progress';
import type { ActionConversationChatlogTracker } from './action_conversation_chatlog_tracker';

function publishCompact(conversationId: string, state: ActionCompactState['state']) {
    const event: ActionRunEvent = {
        actionId: 'review', context: { kind: 'project' }, phase: 'main', rootActionId: 'review', runId: 'run-1',
        status: 'running', type: 'update', update: {
            kind: 'agentCompact', request: {
                actionId: 'review', context: { kind: 'project' }, conversationId, provider: 'codex',
                reference: `activity.json#conversation=${conversationId}`, requestId: conversationId, state,
            },
        },
    };
    actionCompactService.handleEvent(event);
}

function trackerFixture(conversationId: string) {
    const events = new EventTarget();
    const getConversationIdentity = vi.fn(() => conversationId);
    const tracker = {
        getConversationIdentity,
        subscribeConversation: (listener: () => void) => {
            events.addEventListener('changed', listener);
            return () => events.removeEventListener('changed', listener);
        },
    } as unknown as ActionConversationChatlogTracker;
    return { events, getConversationIdentity, tracker };
}

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('ActionConversationCompactProgress', () => {
    it.each(['completed', 'failed'] as const)('shows running compaction and removes the spinner when %s', (state) => {
        vi.spyOn(dialogService, 'error').mockReturnValue({ critical: false, id: 1, message: 'Failed', severity: 'error', title: 'Error' });
        const conversationId = generateUuid();
        const { tracker } = trackerFixture(conversationId);
        render(<ActionConversationCompactProgress onContentChange={vi.fn()} tracker={tracker} />);
        act(() => publishCompact(conversationId, 'queued'));
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        act(() => publishCompact(conversationId, 'running'));
        expect(screen.getByRole('progressbar', { name: 'Compacting conversation' })).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Compacting conversation…');
        act(() => publishCompact(conversationId, state));
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('follows conversation selection and restores running state when the chat reopens', () => {
        const conversationId = generateUuid();
        const { tracker, events, getConversationIdentity } = trackerFixture(conversationId);
        publishCompact(conversationId, 'running');
        const { unmount } = render(<ActionConversationCompactProgress onContentChange={vi.fn()} tracker={tracker} />);
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        act(() => {
            getConversationIdentity.mockReturnValue('unrelated-conversation');
            events.dispatchEvent(new Event('changed'));
        });
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        act(() => {
            getConversationIdentity.mockReturnValue(conversationId);
            events.dispatchEvent(new Event('changed'));
        });
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        unmount();
        render(<ActionConversationCompactProgress onContentChange={vi.fn()} tracker={tracker} />);
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
});

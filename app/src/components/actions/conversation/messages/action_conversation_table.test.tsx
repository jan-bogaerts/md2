import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentConversation, AgentConversationMessageEntry } from '../../../../data/data_types';
import { AppThemeProvider } from '../../../../theme/theme_provider';
import type { ActionConversationCommandOperations } from '../state/action_conversation_command_service';
import type { ActionConversationChatlogTracker } from '../transcript/action_conversation_chatlog_tracker';
import { ActionConversationMessage } from './action_conversation_message';

const tableMessage: AgentConversationMessageEntry = {
    content: '| Id | Description |\n| --- | --- |\n| F_413 | Column widths in read-only markdown tables |',
    id: 'response', kind: 'message', role: 'assistant', timestamp: 'now',
};

function renderTableMessage() {
    const conversation: AgentConversation = {
        actionId: 'review', cardInternalId: 'card-1', cardPath: 'design/F-1.md', completedAt: null,
        entries: [tableMessage], hasExplicitTitle: true, id: 'conversation-1',
        path: 'conversation.json', providerSessions: [], startedAt: 'now', status: 'completed', title: 'Review', viewed: true,
    };
    const commands: ActionConversationCommandOperations = {
        canSaveResponsePhrase: () => true,
        saveAsNewAction: vi.fn(async () => undefined),
        saveAsResponsePhrase: vi.fn(async () => undefined),
        split: vi.fn(async () => undefined),
    };
    const tracker = {
        getConversation: () => conversation,
        getConversationStatus: () => conversation.status,
        getPrompt: () => undefined,
        subscribeConversationStatus: () => () => undefined,
    } as unknown as ActionConversationChatlogTracker;
    render(
        <AppThemeProvider>
            <ActionConversationMessage commands={commands} entry={tableMessage} tracker={tracker} />
        </AppThemeProvider>,
    );
}

describe('ActionConversationTable', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders message tables accessibly with header and cells', () => {
        renderTableMessage();

        const table = screen.getByRole('table');

        expect(table).toContainElement(screen.getByRole('columnheader', { name: 'Description' }));
        expect(table).toContainElement(screen.getByRole('cell', { name: 'F_413' }));
    });

    it('scrolls wide tables inside the message and wraps cells only at word boundaries', () => {
        renderTableMessage();

        expect(screen.getByRole('table').parentElement).toHaveStyle({ overflowX: 'auto' });
        expect(screen.getByRole('columnheader', { name: 'Id' })).toHaveStyle({ overflowWrap: 'break-word' });
        expect(screen.getByRole('cell', { name: 'F_413' })).toHaveStyle({ overflowWrap: 'break-word' });
    });
});

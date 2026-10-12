import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentConversation, AgentConversationMessageEntry } from '../../../../data/data_types';
import { copyTextToClipboard } from '../../../../services/clipboard_text';
import { projectAccessService } from '../../../../services/project/project_access_service';
import { AppThemeProvider } from '../../../../theme/theme_provider';
import type { ActionConversationCommandOperations } from '../state/action_conversation_command_service';
import type { ActionConversationChatlogTracker } from '../transcript/action_conversation_chatlog_tracker';
import { ActionConversationMessage } from './action_conversation_message';

vi.mock('../../../../services/clipboard_text', () => ({ copyTextToClipboard: vi.fn(async () => undefined) }));

const userMessage: AgentConversationMessageEntry = {content: '# Selected prompt\n\nExact **Markdown**', id: 'prompt', kind: 'message', role: 'user', timestamp: 'now'};
const assistantMessage: AgentConversationMessageEntry = {
    content: 'Selected **response**\n\n```ts\nconst value = 1;\n```',
    id: 'response', kind: 'message', role: 'assistant', timestamp: 'now',
};

function renderMessages() {
    const conversation: AgentConversation = {
        actionId: 'review', cardInternalId: 'card-1', cardPath: 'design/F-1.md', completedAt: null,
        entries: [userMessage, assistantMessage], hasExplicitTitle: true, id: 'conversation-1',
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
            <ActionConversationMessage commands={commands} entry={userMessage} tracker={tracker} />
            <ActionConversationMessage commands={commands} entry={assistantMessage} tracker={tracker} />
        </AppThemeProvider>,
    );

    return { commands, conversation };
}

describe('conversation message', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it.each(['user', 'assistant'])('places %s controls after and outside the Markdown bubble', (role) => {
        renderMessages();
        const text = role === 'user' ? screen.getByRole('heading', { name: 'Selected prompt' }) : screen.getByText('response');
        const markdown = text.closest('.mdxeditor-content');
        const bubble = markdown?.parentElement;
        const wrapper = bubble?.parentElement;
        expect(wrapper).toHaveClass('conversation-message');
        expect(bubble).not.toContainElement(screen.getAllByRole('button', { name: 'Copy message' })[role === 'user' ? 0 : 1]);
        expect(bubble?.nextElementSibling).toHaveAttribute('aria-label', 'Message commands');
        const controls = within(bubble!.nextElementSibling as HTMLElement);
        expect(controls.getByRole('button', { name: 'Copy message' })).toBeEnabled();
        expect(controls.getByRole('button', { name: 'Split conversation here' })).toBeEnabled();
        expect(controls.getByRole('button', { name: 'Save message' })).toBeEnabled();
    });

    it('keeps Copy, Split and Save bound to their selected messages', async () => {
        const user = userEvent.setup();
        const { commands, conversation } = renderMessages();

        await user.click(screen.getAllByRole('button', { name: 'Copy message' })[0]);
        expect(copyTextToClipboard).toHaveBeenCalledWith(userMessage.content);
        await user.click(screen.getAllByRole('button', { name: 'Split conversation here' })[1]);
        expect(commands.split).toHaveBeenCalledWith(conversation, assistantMessage);
        await user.click(screen.getAllByRole('button', { name: 'Save message' })[1]);
        await user.click(screen.getByRole('menuitem', { name: 'Save as response phrase' }));
        expect(commands.saveAsResponsePhrase).toHaveBeenCalledWith(assistantMessage);
    });
});

const commands: ActionConversationCommandOperations = {
    canSaveResponsePhrase: () => true,
    saveAsNewAction: vi.fn(async () => undefined),
    saveAsResponsePhrase: vi.fn(async () => undefined),
    split: vi.fn(async () => undefined),
};

function message(content: string, role: AgentConversationMessageEntry['role']): AgentConversationMessageEntry {
    return { content, id: 'message-1', kind: 'message', role, timestamp: '2026-10-04T10:00:00.000Z' };
}

function renderMessage(entry: AgentConversationMessageEntry, status: AgentConversation['status']) {
    const conversation: AgentConversation = {
        actionId: 'review', cardInternalId: 'card-1', cardPath: 'design/F-1.md', completedAt: null, entries: [entry],
        hasExplicitTitle: true, id: 'conversation-1', path: 'design/activity/card__card-1.json#conversation=conversation-1',
        providerSessions: [], startedAt: entry.timestamp, status, title: 'Review', viewed: true,
    };
    const tracker = {
        getConversation: () => conversation,
        getConversationStatus: () => conversation.status,
        getPrompt: () => undefined,
        subscribeConversationStatus: () => () => undefined,
    } as unknown as ActionConversationChatlogTracker;

    return render(
        <AppThemeProvider>
            <ActionConversationMessage commands={commands} entry={entry} tracker={tracker} />
        </AppThemeProvider>,
    );
}

describe('ActionConversationMessage code copying', () => {
    afterEach(() => {
        cleanup();
        projectAccessService.setReadOnly(false);
        vi.clearAllMocks();
    });

    it.each(['user', 'assistant'] as const)('wires block Copy and preserves whole-message Copy for %s messages', async (role) => {
        const content = 'Prose `inline`.\n\n```js\n  first\n```\n\n    second';
        renderMessage(message(content, role), 'completed');
        const buttons = screen.getAllByRole('button', { name: 'Copy code block' });

        expect(buttons).toHaveLength(2);
        await userEvent.click(buttons[0]);
        await userEvent.click(buttons[1]);
        await userEvent.click(screen.getByRole('button', { name: 'Copy message' }));

        expect(copyTextToClipboard).toHaveBeenNthCalledWith(1, '  first\n');
        expect(copyTextToClipboard).toHaveBeenNthCalledWith(2, 'second\n');
        expect(copyTextToClipboard).toHaveBeenNthCalledWith(3, content);
    });

    it('keeps block Copy available for running conversations in read-only projects', async () => {
        projectAccessService.setReadOnly(true);
        renderMessage(message('```\nlive code', 'assistant'), 'running');

        expect(screen.getByRole('button', { name: 'Copy code block' })).toBeEnabled();
        await userEvent.click(screen.getByRole('button', { name: 'Copy code block' }));

        expect(copyTextToClipboard).toHaveBeenCalledExactlyOnceWith('live code\n');
        expect(commands.split).not.toHaveBeenCalled();
        expect(commands.saveAsNewAction).not.toHaveBeenCalled();
        expect(commands.saveAsResponsePhrase).not.toHaveBeenCalled();
    });
});

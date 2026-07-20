import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { conversationReference, persistTerminalConversation } = require('./agent_conversation_persistence');

function conversation(status = 'completed') {
    return {
        actionId: 'implement', completedAt: '2026-07-20T10:01:00.000Z', events: [], id: 'conversation-1',
        messages: [], providerSessions: [], startedAt: '2026-07-20T10:00:00.000Z', status, title: 'Implement',
    };
}

describe('agent conversation persistence', () => {
    it('builds a stable activity reference from card identity and conversation id', () => {
        const request = {
            activityOrigin: { cardInternalId: 'card-1', kind: 'card' }, activityProject: { rootPath: 'C:/repo' },
            projectFolder: 'design',
        };

        expect(conversationReference(request, 'conversation-1'))
            .toBe('design/activity/card__card-1.json#conversation=conversation-1');
    });

    it('builds terminal persistence requests without compatibility mode flags', async () => {
        const activityProject = { branch: 'main', rootPath: 'C:/repo' };
        const request = {activityOrigin: { cardInternalId: 'card-1', kind: 'card' }, activityProject, projectFolder: 'design'};
        const activityFiles = require('./activity_files');
        const upsert = vi.spyOn(activityFiles, 'upsertActivityConversation');

        expect(conversationReference(request, 'conversation-1')).toContain('card__card-1.json');
        expect(upsert).not.toHaveBeenCalled();
    });

    it('rejects persistence before terminal activity ownership is supplied', async () => {
        await expect(persistTerminalConversation({ conversation: conversation(), request: {} }))
            .rejects.toThrow('Missing agent activityProject');
    });
});

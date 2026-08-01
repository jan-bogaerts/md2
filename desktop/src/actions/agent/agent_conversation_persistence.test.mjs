import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { conversationReference, persistTerminalConversation } = require('./agent_conversation_persistence');

describe('agent conversation persistence', () => {
    it('builds a stable activity reference from card identity and conversation id', () => {
        const request = {
            activityOrigin: { cardInternalId: 'card-1', kind: 'card' }, activityProject: { rootPath: 'C:/repo' },
            projectFolder: 'design',
        };

        expect(conversationReference(request, 'conversation-1'))
            .toBe('design/activity/card__card-1.json#conversation=conversation-1');
    });

    it('rejects persistence before terminal activity ownership is supplied', async () => {
        await expect(persistTerminalConversation({ conversation: {}, request: {} }))
            .rejects.toThrow('Missing agent activityProject');
    });
});

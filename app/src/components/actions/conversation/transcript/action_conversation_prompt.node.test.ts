import { describe, expect, it, vi } from 'vitest';
import { ActionConversationPrompt, type ActionConversationPromptSnapshot } from './action_conversation_prompt';

describe('ActionConversationPrompt', () => {
    it('updates delivery and acknowledged message fields without replacing the message object', () => {
        const initial: ActionConversationPromptSnapshot = { content: 'Submitted', prompt: null, runId: null, state: 'transmitting' };
        const prompt = new ActionConversationPrompt('submission-1', initial);
        const entry = prompt.entry;
        const acknowledged = {
            agent: 'codex', content: 'Acknowledged', id: entry.id, kind: 'message' as const,
            role: 'user' as const, sequence: 4, timestamp: 'sent-at',
        };
        const sent: ActionConversationPromptSnapshot = { content: acknowledged.content, prompt: null, runId: 'run-1', state: 'sent' };
        prompt.apply(sent, acknowledged);
        expect(prompt.entry).toBe(entry);
        expect(prompt.entry).toEqual(acknowledged);
        expect(prompt.getSnapshot()).toBe(sent);
    });

    it('publishes applied changes once and stops notifying an unsubscribed observer', () => {
        const initial: ActionConversationPromptSnapshot = { content: 'Submitted', prompt: null, runId: null, state: 'transmitting' };
        const prompt = new ActionConversationPrompt('submission-1', initial);
        const listener = vi.fn();
        const unsubscribe = prompt.subscribe(listener);
        const failed: ActionConversationPromptSnapshot = { ...initial, error: 'Rejected', state: 'failed' };
        prompt.apply(failed);
        expect(listener).not.toHaveBeenCalled();
        prompt.notify();
        expect(listener).toHaveBeenCalledOnce();
        prompt.apply({ ...failed });
        prompt.notify();
        expect(listener).toHaveBeenCalledOnce();
        unsubscribe();
        prompt.apply(initial);
        prompt.notify();
        expect(listener).toHaveBeenCalledOnce();
    });
});

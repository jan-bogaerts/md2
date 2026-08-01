import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    activityFilePath,
    conversationActivityReference,
    parseConversationActivityReference,
} = require('../../../../shared/activity_paths.mjs');

describe('activity paths', () => {
    it('uses stable card identity under tracked project activity', () => {
        expect(activityFilePath('design', { cardInternalId: '550e8400-e29b-41d4-a716-446655440000', kind: 'card' }))
            .toBe('design/activity/card__550e8400-e29b-41d4-a716-446655440000.json');
        expect(activityFilePath('design', { kind: 'project' })).toBe('design/activity/project.json');
    });

    it('round-trips a conversation reference without path normalization', () => {
        const reference = conversationActivityReference('design/activity/card__card-1.json', 'conversation-1');

        expect(parseConversationActivityReference(reference)).toEqual({
            activityPath: 'design/activity/card__card-1.json',
            conversationId: 'conversation-1',
        });
    });

    it('rejects unsafe stable identities', () => {
        expect(() => activityFilePath('design', { cardInternalId: '../card', kind: 'card' })).toThrow('Invalid cardInternalId');
    });
});

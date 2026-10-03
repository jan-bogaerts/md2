import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cardContext } from '../../data/action_context';
import type { Card } from '../../data/data_types';
import { DEFAULT_CARD_TYPES } from '../../data/data_types';
import { cardCollectionFieldChangedEvent, cardFieldChangedEvent, type DataService } from '../../services/data/data_service';
import { useCardMetadata, useCardMetadataByInternalId } from './use_project_card';

function assignedCard(): Card {
    return {
        agentConversationErrors: [], agentConversations: [], content: '', hasFrontmatter: true, isActive: true, path: 'design/F-1.md',
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, branch: 'feature/selected', changedFiles: [],
            id: 'F-1', internalId: 'stable-card', owner: null, policy: {}, references: [], status: 'ready', title: 'Selected feature',
            worktree: 6, worktreeError: null, worktreeValue: '6',
        },
    };
}

function metadataService(card: Card) {
    const snapshot = { activeCards: [card], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' };

    return Object.assign(new EventTarget(), { getState: () => ({ project: null, runningAgents: [], snapshot }) }) as unknown as DataService;
}

describe('card assignment metadata', () => {
    afterEach(() => cleanup());

    it.each(['path', 'internal ID'])('keeps the branch in action contexts selected by %s', (selection) => {
        const card = assignedCard();
        const service = metadataService(card);
        const useMetadata = selection === 'path' ? useCardMetadata : useCardMetadataByInternalId;
        const reference = selection === 'path' ? card.path : card.header.internalId!;
        const { result } = renderHook(() => useMetadata(reference, service));
        const previous = result.current;
        if (!previous) throw new Error('Missing card metadata');
        expect(cardContext(previous, DEFAULT_CARD_TYPES)).toMatchObject({ worktree: '6', worktreeBranch: 'feature/selected' });
        act(() => {
            card.header.branch = 'feature/renamed';
            service.dispatchEvent(new Event(cardFieldChangedEvent(card.path, 'worktree')));
            service.dispatchEvent(new Event(cardCollectionFieldChangedEvent('worktree')));
        });
        const current = result.current;
        if (!current) throw new Error('Missing updated card metadata');
        expect(current).not.toBe(previous);
        expect(cardContext(current, DEFAULT_CARD_TYPES)).toMatchObject({ worktree: '6', worktreeBranch: 'feature/renamed' });
    });
});

import { closestCorners, pointerWithin, type CollisionDetection } from '@dnd-kit/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cardSequenceCollision } from './card_sequence_collision';
import { CARD_SEQUENCE_DROP_ID, cardSequenceItemId } from './card_sequence_dnd';

vi.mock('@dnd-kit/core', () => ({ closestCorners: vi.fn(() => []), pointerWithin: vi.fn(() => []) }));

function collisionArguments(activeId: string) {
    return {
        active: { id: activeId },
        droppableContainers: [{ id: 'board' }, { id: CARD_SEQUENCE_DROP_ID }, { id: cardSequenceItemId('card-1') }],
    } as Parameters<CollisionDetection>[0];
}

describe('cardSequenceCollision', () => {
    beforeEach(() => vi.clearAllMocks());

    it('prioritizes sequence drop targets under a board card pointer', () => {
        vi.mocked(pointerWithin).mockReturnValueOnce([{ id: CARD_SEQUENCE_DROP_ID }]);
        const argumentsValue = collisionArguments('board-card');
        cardSequenceCollision(argumentsValue);
        expect(closestCorners).toHaveBeenCalledWith({...argumentsValue, droppableContainers: argumentsValue.droppableContainers.slice(1)});
    });

    it('keeps dragged sequence rows inside sequence targets when pointer misses', () => {
        const argumentsValue = collisionArguments(cardSequenceItemId('card-1'));
        cardSequenceCollision(argumentsValue);
        expect(closestCorners).toHaveBeenCalledWith({...argumentsValue, droppableContainers: argumentsValue.droppableContainers.slice(1)});
    });

    it('retains ordinary board collision behavior outside sequence targets', () => {
        const argumentsValue = collisionArguments('board-card');
        cardSequenceCollision(argumentsValue);
        expect(closestCorners).toHaveBeenCalledWith(argumentsValue);
    });
});

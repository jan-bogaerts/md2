import { closestCorners, pointerWithin, type CollisionDetection } from '@dnd-kit/core';
import { cardInternalIdFromSequenceItem, isCardSequenceDropId } from './card_sequence_dnd';

/** Prefer sequence targets under the pointer; sequence rows never drop into board columns. */
export const cardSequenceCollision: CollisionDetection = (argumentsValue) => {
    const sequenceContainers = argumentsValue.droppableContainers.filter(({ id }) => isCardSequenceDropId(String(id)));
    const sequenceArguments = { ...argumentsValue, droppableContainers: sequenceContainers };
    const collisions = pointerWithin(sequenceArguments);
    if (collisions.length > 0) return closestCorners(sequenceArguments);
    if (cardInternalIdFromSequenceItem(String(argumentsValue.active.id))) return closestCorners(sequenceArguments);

    return closestCorners(argumentsValue);
};

import { actionsForContext, cardContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import type { Card, CardTypeConfig } from '../../../../data/data_types'

/** Actions applicable to every selected card, preserving action load order. */
export function cardSequenceActions(
    actions: ActionDefinition[],
    cards: Card[],
    cardTypes: CardTypeConfig[],
): ActionDefinition[] {
    if (cards.length === 0) return []

    const applicableIds = cards.map((card) => new Set(
        actionsForContext(actions, cardContext(card, cardTypes))
            .filter(({ builtin }) => !builtin)
            .map(({ id }) => id),
    ))

    return actions.filter((action) => !action.builtin && applicableIds.every((ids) => ids.has(action.id)))
}

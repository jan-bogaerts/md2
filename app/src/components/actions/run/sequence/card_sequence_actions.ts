import { isSequenceCardAssigned } from './card_sequence_eligibility';
import { cardContext } from '../../../../data/action_context'
import { ACTION_APPLIES_TO_FIELDS, type ActionDefinition } from '../../../../data/action_types';
import type { Card, CardTypeConfig, WorktreeRecord } from '../../../../data/data_types'

/** Actions applicable to every selected card, preserving action load order. */
export function cardSequenceActions(
    actions: ActionDefinition[],
    cards: Card[],
    cardTypes: CardTypeConfig[],
    worktrees: WorktreeRecord[],
    worktreeBranch?: string,
): ActionDefinition[] {
    if (cards.length === 0 || cards.some(isSequenceCardAssigned)) return [];
    const index = worktrees.findIndex(({ branch, valid }) => valid && branch === worktreeBranch);
    if (worktreeBranch && index < 0) return [];

    const contexts = cards.map((card) => ({
        ...cardContext(card, cardTypes, worktrees),
        ...(worktreeBranch ? { worktree: String(index + 1), worktreeBranch } : {}),
    }));

    return actions.filter(({ builtin, appliesTo }) => !builtin && contexts.every((context) => (
        ACTION_APPLIES_TO_FIELDS.every((field) => appliesTo?.[field] === undefined || context[field] === appliesTo[field])
    )));
}

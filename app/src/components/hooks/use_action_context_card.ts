import type { ActionContext } from '../../data/action_context'
import { useProjectState } from './use_project_state'

/** Resolves current card data for a leaf bound to a stable action context. */
export function useActionContextCard(context: ActionContext) {
    const { snapshot } = useProjectState()
    const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
    const card = context.cardInternalId
        ? cards.find(({ header }) => header.internalId === context.cardInternalId) ?? null
        : cards.find(({ path }) => path === context.file) ?? null

    return { card, cardPath: card?.path ?? context.file ?? null }
}

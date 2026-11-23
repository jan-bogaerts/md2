import { useCallback, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import { dataService } from '../../../../services/data/data_service'
import { isReleasedCardActionContext } from '../../../../../../shared/released_card_actions.mjs'

function historicalActivityKey(context: ActionContext, releasesFolder: string | undefined) {
    const { project, snapshot } = dataService.getState()
    const cardInternalId = context.cardInternalId
    if (!cardInternalId) return null
    const backgroundCard = snapshot?.backgroundCards.find(({ header }) => header.internalId === cardInternalId)
    const releasedCard = releasesFolder && isReleasedCardActionContext(context, releasesFolder)
        ? snapshot?.activeCards.find(({ header }) => header.internalId === cardInternalId)
        : null
    const card = backgroundCard ?? releasedCard
    if (!card || !project) return null

    const references = card.header.agentLogReferences.join('\u0000')

    return `${project.id}\u0000${project.branch}\u0000${card.header.internalId}\u0000${references}`
}

function subscribeProjectChanges(listener: () => void) {
    dataService.addEventListener('changed', listener)

    return () => dataService.removeEventListener('changed', listener)
}

function subscribeNothing() {
    return () => undefined
}

/**
 * Activity key of a historical (background) card, derived from its project and activity references.
 * Background cards publish no per-field events; the primitive key keeps unrelated project changes
 * from rendering. Active released cards also use their referenced activity instead of live card data.
 */
export function useHistoricalActivityKey(context: ActionContext, releasesFolder: string | undefined) {
    const cardInternalId = context.cardInternalId ?? null
    const subscribe = cardInternalId ? subscribeProjectChanges : subscribeNothing
    const getSnapshot = useCallback(
        () => cardInternalId ? historicalActivityKey(context, releasesFolder) : null,
        [cardInternalId, context, releasesFolder],
    )

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

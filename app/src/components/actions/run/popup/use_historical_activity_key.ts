import { useCallback, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import { dataService } from '../../../../services/data/data_service'

function historicalActivityKey(cardInternalId: string) {
    const { project, snapshot } = dataService.getState()
    const card = snapshot?.backgroundCards.find(({ header }) => header.internalId === cardInternalId)
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
 * from rendering. Non-historical contexts do not subscribe at all.
 */
export function useHistoricalActivityKey(context: ActionContext) {
    const cardInternalId = context.kind === 'file' ? context.cardInternalId ?? null : null
    const subscribe = cardInternalId ? subscribeProjectChanges : subscribeNothing
    const getSnapshot = useCallback(() => cardInternalId ? historicalActivityKey(cardInternalId) : null, [cardInternalId])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

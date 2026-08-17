import type { Card } from '../../data/data_types'
import { normalizePath } from '../../../../shared/path_utils.mjs'
import { parseConversationActivityReference } from '../../../../shared/activity_paths.mjs'

export interface AgentReferenceMigrationConflict {
    cardPath: string
    message: string
}

export interface AgentReferenceMigrationPlan {
    cardPath: string
    references: string[]
}

export function activityPathForCardReference(reference: string) {
    return reference.includes('#conversation=')
        ? parseConversationActivityReference(reference).activityPath
        : reference
}

/** Plans compound-reference removal without selecting between conflicting activity files. */
export function planAgentReferenceMigration(cards: Card[]) {
    const conflicts: AgentReferenceMigrationConflict[] = []
    const plans: AgentReferenceMigrationPlan[] = []

    for (const card of cards) {
        try {
            const referencesByPath = new Map<string, string>()
            for (const reference of card.header.agentLogReferences) {
                const path = activityPathForCardReference(reference)
                const normalizedPath = normalizePath(path)
                if (!referencesByPath.has(normalizedPath)) referencesByPath.set(normalizedPath, path)
            }
            if (referencesByPath.size > 1) {
                conflicts.push({
                    cardPath: card.path,
                    message: `Card references multiple activity files: ${[...referencesByPath.values()].join(', ')}`,
                })
                continue
            }

            const references = [...referencesByPath.values()]
            const unchanged = references.length === card.header.agentLogReferences.length
                && references.every((reference, index) => reference === card.header.agentLogReferences[index])
            if (!unchanged) plans.push({ cardPath: card.path, references })
        } catch (error) {
            conflicts.push({
                cardPath: card.path,
                message: error instanceof Error ? error.message : 'Agent references could not be migrated',
            })
        }
    }

    return { conflicts, plans }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { dataService } from '../../services/data/data_service'
import { actionRunRegistry } from '../../services/actions/action_run_registry'
import type { ActionRunEvent } from '../../data/action_run_types'
import { loadCardCommits, type CardCommit } from '../../services/actions/card_commit_history'
import { worktreeService } from '../../services/project/worktree_service'
import type { ProjectReference } from '../../data/data_types'

interface CardCommitsState {
    commits: CardCommit[]
    error: Error | null
    loading: boolean
    reload: () => void
}

interface CardCommitsResult {
    cardInternalId: string | null
    commits: CardCommit[]
    error: Error | null
    reloadNonce: number
}

function projectKey(project: ProjectReference | null) {
    return project ? `${project.id}\u0000${project.branch}` : ''
}

/** Load one card's visible commit history and refresh it when repository state changes. */
export function useCardCommits(cardInternalId: string | null): CardCommitsState {
    const requestId = useRef(0)
    const currentProjectKey = useRef(projectKey(dataService.getState().project))
    const [result, setResult] = useState<CardCommitsResult>({ cardInternalId: null, commits: [], error: null, reloadNonce: -1 })
    const [reloadNonce, setReloadNonce] = useState(0)
    const reload = useCallback(() => setReloadNonce((current) => current + 1), [])

    useEffect(() => {
        const handleActionEvent = (event: ActionRunEvent) => {
            if (event.type !== 'run' || event.status === 'running') return
            reload()
        }
        const handleProjectChange = () => {
            const nextProjectKey = projectKey(dataService.getState().project)
            if (nextProjectKey === currentProjectKey.current) return
            currentProjectKey.current = nextProjectKey
            reload()
        }
        const actionContext = { ...(cardInternalId ? { cardInternalId } : {}), kind: 'card' as const }
        const unsubscribeAction = actionRunRegistry.subscribeContextEvents(actionContext, handleActionEvent)
        worktreeService.addEventListener('changed', reload)
        dataService.addEventListener('changed', handleProjectChange)
        dataService.addEventListener('repositoryChanged', reload)

        return () => {
            unsubscribeAction()
            worktreeService.removeEventListener('changed', reload)
            dataService.removeEventListener('changed', handleProjectChange)
            dataService.removeEventListener('repositoryChanged', reload)
        }
    }, [cardInternalId, reload])

    useEffect(() => {
        requestId.current += 1
        const currentRequestId = requestId.current
        if (!cardInternalId) return undefined
        void loadCardCommits(cardInternalId).then((nextCommits) => {
            if (requestId.current !== currentRequestId) return
            setResult({ cardInternalId, commits: nextCommits, error: null, reloadNonce })
        }).catch((loadError: unknown) => {
            if (requestId.current !== currentRequestId) return
            const error = loadError instanceof Error ? loadError : new Error('Could not load card commit history')
            setResult({ cardInternalId, commits: [], error, reloadNonce })
        })

        return () => {
            if (requestId.current === currentRequestId) requestId.current += 1
        }
    }, [cardInternalId, reloadNonce])

    const isCurrent = result.cardInternalId === cardInternalId && result.reloadNonce === reloadNonce

    return {
        commits: isCurrent ? result.commits : [],
        error: isCurrent ? result.error : null,
        loading: cardInternalId !== null && !isCurrent,
        reload,
    }
}

import { useSyncExternalStore } from 'react'
import { worktreeService } from '../../services/project/worktree_service'

function subscribe(onStoreChange: () => void) {
    worktreeService.addEventListener('changed', onStoreChange)

    return () => worktreeService.removeEventListener('changed', onStoreChange)
}

export function useWorktrees() {
    return useSyncExternalStore(subscribe, () => worktreeService.getRecords())
}

export function useProjectActionWorktree() {
    return useSyncExternalStore(subscribe, () => worktreeService.getProjectActionWorktree())
}

export function usePrimaryWorktreeStatus() {
    return useSyncExternalStore(subscribe, () => worktreeService.getPrimaryStatus())
}

export function useWorktreeAdding() {
    return useSyncExternalStore(subscribe, () => worktreeService.isAdding())
}

export function useWorktreePreparing(cardPath: string | null) {
    return useSyncExternalStore(subscribe, () => (cardPath ? worktreeService.isPreparingCard(cardPath) : false))
}

export function useProjectWorktreePreparing() {
    return useSyncExternalStore(subscribe, () => worktreeService.isPreparingProjectWorktree())
}

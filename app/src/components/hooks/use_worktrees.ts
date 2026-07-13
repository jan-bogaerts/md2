import { useSyncExternalStore } from 'react'
import { worktreeService } from '../../services/worktree_service'

function subscribe(onStoreChange: () => void) {
    worktreeService.addEventListener('changed', onStoreChange)

    return () => worktreeService.removeEventListener('changed', onStoreChange)
}

export function useWorktrees() {
    return useSyncExternalStore(subscribe, () => worktreeService.getRecords())
}

export function useWorktreeDraft() {
    return useSyncExternalStore(subscribe, () => worktreeService.getDraft())
}

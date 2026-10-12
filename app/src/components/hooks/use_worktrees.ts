import { useSyncExternalStore } from 'react'
import { worktreeService } from '../../services/project/worktree_service'

function subscribe(onStoreChange: () => void) {
    worktreeService.addEventListener('changed', onStoreChange)
    worktreeService.addEventListener('recordChanged', onStoreChange)
    worktreeService.addEventListener('recordsChanged', onStoreChange)
    worktreeService.addEventListener('primaryStatusChanged', onStoreChange)
    worktreeService.addEventListener('assignmentChanged', onStoreChange)

    return () => {
        worktreeService.removeEventListener('changed', onStoreChange)
        worktreeService.removeEventListener('recordChanged', onStoreChange)
        worktreeService.removeEventListener('recordsChanged', onStoreChange)
        worktreeService.removeEventListener('primaryStatusChanged', onStoreChange)
        worktreeService.removeEventListener('assignmentChanged', onStoreChange)
    }
}

export function useWorktrees() {
    useSyncExternalStore(subscribe, () => JSON.stringify(worktreeService.getRecords()))

    return worktreeService.getRecords()
}

export function useOpenWorktrees(open: boolean) {
    useSyncExternalStore(subscribe, () => open ? JSON.stringify(worktreeService.getRecords()) : '')

    return open ? worktreeService.getRecords() : []
}

export function useProjectActionWorktree() {
    return useSyncExternalStore(subscribe, () => worktreeService.getProjectActionWorktree())
}

export function useProjectActionWorktreeBranch() {
    return useSyncExternalStore(subscribe, () => worktreeService.getProjectActionWorktreeBranch());
}

export function usePrimaryWorktreeStatus() {
    return useSyncExternalStore(subscribe, () => worktreeService.getPrimaryStatus())
}

export function useWorktreeAdding() {
    return useSyncExternalStore(subscribe, () => worktreeService.getDraft()?.selecting ?? false)
}

export function useWorktreeDraft() {
    useSyncExternalStore(subscribe, () => JSON.stringify(worktreeService.getDraft()))

    return worktreeService.getDraft()
}

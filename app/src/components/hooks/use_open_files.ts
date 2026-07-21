import { useSyncExternalStore } from 'react'
import { openFilesService } from '../../services/open_files_service'

function subscribeToOpenFiles(onStoreChange: () => void) {
    openFilesService.addEventListener('changed', onStoreChange)

    return () => openFilesService.removeEventListener('changed', onStoreChange)
}

function getOpenFilesSnapshot() {
    return openFilesService.getSnapshot()
}

/** Subscribe to the open documents and active document owned by the open-files service. */
export function useOpenFiles() {
    return useSyncExternalStore(
        subscribeToOpenFiles,
        getOpenFilesSnapshot,
        getOpenFilesSnapshot,
    )
}

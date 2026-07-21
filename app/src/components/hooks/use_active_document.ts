import { useCallback, useSyncExternalStore } from 'react'
import { openFilesService, type OpenDocument } from '../../services/open_files_service'

function subscribeToOpenFiles(onStoreChange: () => void) {
    openFilesService.addEventListener('changed', onStoreChange)

    return () => openFilesService.removeEventListener('changed', onStoreChange)
}

function documentPath(document: OpenDocument | null) {
    if (!document) return null
    if (document.kind === 'card') return document.getObject().path
    const { id, sourcePath } = document.getObject()
    if (!sourcePath) throw new Error(`Open action has no source path: ${id}`)

    return sourcePath
}

function getActiveDocumentPathSnapshot() {
    return documentPath(openFilesService.getSnapshot().activeDocument)
}

/** Subscribe to the path of the active document. */
export function useActiveDocumentPath(): string | null {
    return useSyncExternalStore(
        subscribeToOpenFiles,
        getActiveDocumentPathSnapshot,
        getActiveDocumentPathSnapshot,
    )
}

/** Subscribe only when the active-document state for one path changes. */
export function useIsActiveDocument(path: string | null): boolean {
    const getIsActiveDocumentSnapshot = useCallback(
        () => path !== null && getActiveDocumentPathSnapshot() === path,
        [path],
    )

    return useSyncExternalStore(
        subscribeToOpenFiles,
        getIsActiveDocumentSnapshot,
        getIsActiveDocumentSnapshot,
    )
}

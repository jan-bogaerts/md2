import { useCallback, useSyncExternalStore } from 'react'
import { openFilesService, type OpenDocument } from '../../services/open_files_service'
import { useDialogError } from './use_dialog_error'

const INVALID_ACTION_PATH_PREFIX = '\u0000invalid-action-path:'
const ACTIVE_DOCUMENT_STATUS = { active: true, error: null }
const INACTIVE_DOCUMENT_STATUS = { active: false, error: null }
const invalidDocumentStatuses = new Map<string, { active: false, error: Error }>()

function subscribeToOpenFiles(onStoreChange: () => void) {
    openFilesService.addEventListener('changed', onStoreChange)

    return () => openFilesService.removeEventListener('changed', onStoreChange)
}

function documentPath(document: OpenDocument | null) {
    if (!document) return null
    if (document.kind === 'card') return document.getObject().path
    const { id, sourcePath } = document.getObject()
    if (!sourcePath) return `${INVALID_ACTION_PATH_PREFIX}${id}`

    return sourcePath
}

function getActiveDocumentPathSnapshot() {
    return documentPath(openFilesService.getSnapshot().activeDocument)
}

/** Subscribe to the path of the active document. */
export function useActiveDocumentPath(): string | null {
    const snapshot = useSyncExternalStore(
        subscribeToOpenFiles,
        getActiveDocumentPathSnapshot,
        getActiveDocumentPathSnapshot,
    )
    const error = snapshot?.startsWith(INVALID_ACTION_PATH_PREFIX)
        ? new Error(`Open action has no source path: ${snapshot.slice(INVALID_ACTION_PATH_PREFIX.length)}`)
        : null
    useDialogError(error, 'Active document path is unavailable')

    return error ? null : snapshot
}

/** Subscribe only when the active-document state for one path changes. */
export function useIsActiveDocument(path: string | null): boolean {
    const getStatusSnapshot = useCallback(
        () => {
            const snapshot = getActiveDocumentPathSnapshot()
            if (snapshot?.startsWith(INVALID_ACTION_PATH_PREFIX)) {
                const id = snapshot.slice(INVALID_ACTION_PATH_PREFIX.length)
                const existingStatus = invalidDocumentStatuses.get(id)
                if (existingStatus) return existingStatus

                const status = { active: false as const, error: new Error(`Open action has no source path: ${id}`) }
                invalidDocumentStatuses.set(id, status)

                return status
            }

            return path !== null && snapshot === path ? ACTIVE_DOCUMENT_STATUS : INACTIVE_DOCUMENT_STATUS
        },
        [path],
    )

    const status = useSyncExternalStore(
        subscribeToOpenFiles,
        getStatusSnapshot,
        getStatusSnapshot,
    )
    useDialogError(status.error, 'Active document state is unavailable')

    return status.active
}

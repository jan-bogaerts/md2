import { useCallback, useSyncExternalStore } from 'react'
import {
    openFilesService,
    type OpenDocument,
    type OpenDocumentObject,
    type OpenFilesService,
} from '../../services/open_files_service'

export interface OpenTabsState {
    activeDocument: OpenDocument | null
    activateTab: (document: OpenDocument) => void
    closeTab: (document: OpenDocument) => void
    openTab: (object: OpenDocumentObject) => OpenDocument
    tabs: readonly OpenDocument[]
}

/**
 * Connect text-view tabs to the shared open-files state. Opening a file activates
 * its existing tab, and closing the active tab focuses a neighbouring tab.
 */
export function useOpenTabs(service: OpenFilesService = openFilesService): OpenTabsState {
    const snapshot = useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => service.getSnapshot(),
        () => service.getSnapshot(),
    )

    const openTab = useCallback((object: OpenDocumentObject) => {
        return service.openDocument(object)
    }, [service])

    const activateTab = useCallback((document: OpenDocument) => {
        service.activateDocument(document)
    }, [service])

    const closeTab = useCallback((document: OpenDocument) => {
        service.closeDocument(document)
    }, [service])

    return { activeDocument: snapshot.activeDocument, activateTab, closeTab, openTab, tabs: snapshot.documents }
}

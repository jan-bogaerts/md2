import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { openFilesService, type OpenFilesService } from '../../services/open_files_service'

export interface OpenTabsState {
    activePath: string | null
    activateTab: (path: string) => void
    closeTab: (path: string) => void
    openTab: (path: string) => void
    tabs: string[]
}

/**
 * Connect text-view tabs to the shared open-files state. Opening a file activates
 * its existing tab, and closing the active tab focuses a neighbouring tab.
 */
export function useOpenTabs(
    availablePaths: string[] | null = null,
    service: OpenFilesService = openFilesService,
): OpenTabsState {
    const snapshot = useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => service.getSnapshot(),
        () => service.getSnapshot(),
    )

    useEffect(() => {
        if (availablePaths) service.retainAvailableFiles(availablePaths)
    }, [availablePaths, service])

    const openTab = useCallback((path: string) => {
        service.openFile(path)
    }, [service])

    const activateTab = useCallback((path: string) => {
        service.activateFile(path)
    }, [service])

    const closeTab = useCallback((path: string) => {
        service.closeFile(path)
    }, [service])

    return { activePath: snapshot.activePath, activateTab, closeTab, openTab, tabs: snapshot.paths }
}

import { useCallback, useState } from 'react'

export interface OpenTabsState {
    activePath: string | null
    activateTab: (path: string) => void
    closeTab: (path: string) => void
    openTab: (path: string) => void
    tabs: string[]
}

interface TabsSnapshot {
    activePath: string | null
    tabs: string[]
}

const EMPTY: TabsSnapshot = { activePath: null, tabs: [] }

/**
 * Manage the open-file tabs for the text view: opening a file activates its
 * existing tab instead of duplicating it, and closing the active tab focuses a
 * neighbouring tab so the editor never lands on nothing while tabs remain.
 */
export function useOpenTabs(): OpenTabsState {
    const [state, setState] = useState<TabsSnapshot>(EMPTY)

    const openTab = useCallback((path: string) => {
        setState((current) => {
            if (current.tabs.includes(path)) return { ...current, activePath: path }

            return { activePath: path, tabs: [...current.tabs, path] }
        })
    }, [])

    const activateTab = useCallback((path: string) => {
        setState((current) => (current.tabs.includes(path) ? { ...current, activePath: path } : current))
    }, [])

    const closeTab = useCallback((path: string) => {
        setState((current) => {
            const index = current.tabs.indexOf(path)
            if (index === -1) return current

            const tabs = current.tabs.filter((tab) => tab !== path)
            if (current.activePath !== path) return { activePath: current.activePath, tabs }

            const neighbour = tabs[index] ?? tabs[index - 1] ?? null

            return { activePath: neighbour, tabs }
        })
    }, [])

    return { activePath: state.activePath, activateTab, closeTab, openTab, tabs: state.tabs }
}

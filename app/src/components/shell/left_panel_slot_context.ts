import { createContext, useContext } from 'react'

interface LeftPanelSlotContextValue {
    registerSlot: () => void
    setTargetElement: (element: HTMLElement | null) => void
    slotCount: number
    targetElement: HTMLElement | null
    unregisterSlot: () => void
}

export const LeftPanelSlotContext = createContext<LeftPanelSlotContextValue | null>(null)

/** Returns the left-panel slot context or fails fast when the provider is missing. */
export function useLeftPanelSlotContext() {
    const context = useContext(LeftPanelSlotContext)
    if (!context) throw new Error('LeftPanelSlotProvider is required')

    return context
}

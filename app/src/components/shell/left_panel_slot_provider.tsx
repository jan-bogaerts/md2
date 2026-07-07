import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { LeftPanelSlotContext } from './left_panel_slot_context'

interface LeftPanelSlotProviderProps {
    children: ReactNode
}

/** Provides the current left-panel portal target without storing rendered panel content. */
export function LeftPanelSlotProvider(props: LeftPanelSlotProviderProps) {
    const { children } = props
    const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
    const [slotCount, setSlotCount] = useState(0)

    const registerSlot = useCallback(() => {
        setSlotCount((currentCount) => currentCount + 1)
    }, [])

    const unregisterSlot = useCallback(() => {
        setSlotCount((currentCount) => Math.max(0, currentCount - 1))
    }, [])

    const context = useMemo(() => ({
        registerSlot,
        setTargetElement,
        slotCount,
        targetElement,
        unregisterSlot,
    }), [registerSlot, slotCount, targetElement, unregisterSlot])

    return (
        <LeftPanelSlotContext.Provider value={context}>
            {children}
        </LeftPanelSlotContext.Provider>
    )
}

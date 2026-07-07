import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLeftPanelSlotContext } from './left_panel_slot_context'

interface LeftPanelSlotProps {
    children: ReactNode
}

/** Renders children into the shell left panel through a portal. */
export function LeftPanelSlot(props: LeftPanelSlotProps) {
    const { children } = props
    const { registerSlot, targetElement, unregisterSlot } = useLeftPanelSlotContext()

    useEffect(() => {
        registerSlot()

        return unregisterSlot
    }, [registerSlot, unregisterSlot])

    if (!targetElement) return null

    return createPortal(children, targetElement)
}

import { Box, Typography } from '@mui/material'
import { useCallback } from 'react'
import { useLeftPanelSlotContext } from './left_panel_slot_context'

const PANEL_PADDING = 2

interface LeftPanelTargetProps {
    fallback: string
}

/** Mount point for view-owned left-panel content. */
export function LeftPanelTarget(props: LeftPanelTargetProps) {
    const { fallback } = props
    const { setTargetElement, slotCount } = useLeftPanelSlotContext()

    const handleTargetElement = useCallback((element: HTMLDivElement | null) => {
        setTargetElement(element)
    }, [setTargetElement])

    return (
        <Box sx={{ boxSizing: 'border-box', height: '100%', minHeight: 0, p: slotCount === 0 ? PANEL_PADDING : 0 }}>
            <Box
                data-left-panel-target="true"
                ref={handleTargetElement}
                sx={{ height: slotCount > 0 ? '100%' : undefined, minHeight: 0 }}
            />
            {slotCount === 0 ? (
                <Typography color="text.secondary" variant="body2">
                    {fallback}
                </Typography>
            ) : null}
        </Box>
    )
}

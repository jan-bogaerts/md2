import { Box, Tooltip } from '@mui/material'
import type { MouseEvent, PointerEvent } from 'react'

const LED_SIZE = 12

interface PolicyLedProps {
    enabled: boolean
    onToggle: (policyKey: string) => void
    policyKey: string
}

/** A small round indicator for one policy flag; clicking toggles the policy. */
export function PolicyLed(props: PolicyLedProps) {
    const { enabled, onToggle, policyKey } = props

    const handleClick = (event: MouseEvent) => {
        event.stopPropagation()
        onToggle(policyKey)
    }

    const stopDrag = (event: PointerEvent) => {
        event.stopPropagation()
    }

    return (
        <Tooltip title={`${policyKey}: ${enabled ? 'on' : 'off'}`}>
            <Box
                aria-label={`Toggle ${policyKey}`}
                aria-pressed={enabled}
                component="button"
                onClick={handleClick}
                onPointerDown={stopDrag}
                sx={{
                    bgcolor: enabled ? 'success.main' : 'action.disabled',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    height: LED_SIZE,
                    p: 0,
                    width: LED_SIZE,
                }}
                type="button"
            />
        </Tooltip>
    )
}

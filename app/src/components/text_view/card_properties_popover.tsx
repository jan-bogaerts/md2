import { Popover } from '@mui/material'
import type { ReactNode } from 'react'

interface CardPropertiesPopoverProps {
    anchorElement: HTMLElement | null
    children: ReactNode
    onClose: () => void
    open: boolean
}

/** Anchored popup containing the active card's Properties panel. */
export function CardPropertiesPopover(props: CardPropertiesPopoverProps) {
    const { anchorElement, children, onClose, open } = props

    return (
        <Popover
            anchorEl={anchorElement}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            onClose={onClose}
            open={open}
            slotProps={{
                paper: {
                    'aria-label': 'Card properties popup',
                    role: 'dialog',
                    sx: {
                        bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                        borderRadius: '14px', boxShadow: '0 24px 60px rgba(16,24,40,0.28)',
                        maxWidth: 'calc(100vw - 32px)', p: 2, width: 640,
                    },
                },
            }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            transitionDuration={80}
        >
            {children}
        </Popover>
    )
}

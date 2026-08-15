import { Dialog, Popover } from '@mui/material'
import type { ReactNode } from 'react'

interface StatusDetailsSurfaceProps {
    anchorElement: HTMLElement | null
    children: ReactNode
    labelId: string
    mobile: boolean
    onClose: () => void
}

/** Uses existing desktop popover placement and a viewport-safe dialog on mobile. */
export function StatusDetailsSurface(props: StatusDetailsSurfaceProps) {
    const { anchorElement, children, labelId, mobile, onClose } = props

    if (mobile) {
        return (
            <Dialog
                aria-labelledby={labelId}
                fullWidth
                maxWidth="xs"
                onClose={onClose}
                open={!!anchorElement}
                slotProps={{ paper: { sx: { m: 1, maxHeight: 'calc(100vh - 16px)', maxWidth: 'calc(100vw - 16px)' } } }}
            >
                {children}
            </Dialog>
        )
    }

    return (
        <Popover
            anchorEl={anchorElement}
            anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
            onClose={onClose}
            open={!!anchorElement}
            transformOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
            {children}
        </Popover>
    )
}

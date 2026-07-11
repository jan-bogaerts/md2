import { Box } from '@mui/material'
import type { ReactNode } from 'react'

interface MenuProps {
    children: ReactNode
}

/** Top-level container for the active app menu tab content. */
export function Menu(props: MenuProps) {
    const { children } = props

    return (
        <Box sx={{ bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', height: 52, px: 1.5 }}>
            {children}
        </Box>
    )
}

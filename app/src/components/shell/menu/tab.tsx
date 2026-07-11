import { Stack } from '@mui/material'
import type { ReactNode } from 'react'

interface TabProps {
    children: ReactNode
    label?: string
}

/** A single page of the app menu; renders one or more Sections in a row. Holds no state of its own. */
export function Tab(props: TabProps) {
    const { children } = props

    return (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', height: 52, overflowX: 'auto' }}>
            {children}
        </Stack>
    )
}

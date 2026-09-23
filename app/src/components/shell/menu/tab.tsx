import { Stack } from '@mui/material'
import type { ReactNode } from 'react'
import { HorizontalScrollArea } from '../../horizontal_scroll_area'

interface TabProps {
    children: ReactNode
    label?: string
}

/** A single page of the app menu; renders one or more Sections in a row. Holds no state of its own. */
export function Tab(props: TabProps) {
    const { children } = props

    return (
        <HorizontalScrollArea>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flex: 1, height: 52 }}>
                {children}
            </Stack>
        </HorizontalScrollArea>
    )
}

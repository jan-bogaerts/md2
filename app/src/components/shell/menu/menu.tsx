import { Stack } from '@mui/material'
import type { ReactNode } from 'react'

interface MenuProps {
    children: ReactNode
}

/** Top-level container for the app menu; renders one or more Tabs. Holds no state of its own. */
export function Menu(props: MenuProps) {
    const { children } = props

    return <Stack direction="row">{children}</Stack>
}

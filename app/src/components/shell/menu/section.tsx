import { Box } from '@mui/material'
import type { ReactNode } from 'react'

interface SectionProps {
    children: ReactNode
    label: string
}

/** An accessible toolbar group; its visible controls are explained with tooltips. */
export function Section(props: SectionProps) {
    const { children, label } = props

    return (
        <Box aria-label={label} role="group" sx={{ alignItems: 'center', display: 'flex', gap: 0.75 }}>
            {children}
        </Box>
    )
}

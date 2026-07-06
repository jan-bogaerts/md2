import { Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'

interface SectionProps {
    children: ReactNode
    label: string
}

/** A labeled group of icon buttons/toggles within a menu Tab; the label is shown below the group. */
export function Section(props: SectionProps) {
    const { children, label } = props

    return (
        <Stack sx={{ alignItems: 'center' }}>
            <Stack direction="row">{children}</Stack>
            <Typography color="text.secondary" variant="caption">
                {label}
            </Typography>
        </Stack>
    )
}

import { Box, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'

interface SectionProps {
    children: ReactNode
    label: string
}

/** A labeled group of icon buttons/toggles within a menu tab; the label is shown below the group. */
export function Section(props: SectionProps) {
    const { children, label } = props

    return (
        <Box sx={{ borderRight: 1, borderColor: 'divider', pr: 1.25 }}>
            <Stack sx={{ alignItems: 'center', gap: 0.5 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minHeight: 40 }}>
                    {children}
                </Stack>
                <Typography color="text.secondary" variant="caption">
                    {label}
                </Typography>
            </Stack>
        </Box>
    )
}

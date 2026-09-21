import { Box, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'

interface ConfigSubsectionProps {
    children: ReactNode
    description: string
    id: string
    label: string
}

/** Headed group of config fields with a one-line explanation, used to split a long config section. */
export function ConfigSubsection(props: ConfigSubsectionProps) {
    const { children, description, id, label } = props
    const headingId = `${id}-config-subsection-heading`

    return (
        <Box aria-labelledby={headingId} component="section" id={id}>
            <Stack spacing={1}>
                <Typography component="h4" id={headingId} variant="subtitle1">
                    {label}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                    {description}
                </Typography>
                <Stack spacing={3} sx={{ pt: 1 }}>
                    {children}
                </Stack>
            </Stack>
        </Box>
    )
}

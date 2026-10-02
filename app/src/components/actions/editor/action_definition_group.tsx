import { Card, CardContent, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'

interface ActionDefinitionGroupProps {
    children: ReactNode
    description: string
    id: string
    title: string
}

/** Outlined group of related action definition controls. */
export function ActionDefinitionGroup(props: ActionDefinitionGroupProps) {
    const { children, description, id, title } = props
    const headingId = `${id}-heading`

    return (
        <Card aria-labelledby={headingId} component="section" id={id} variant="outlined">
            <CardContent>
                <Stack spacing={1}>
                    <Typography component="h3" id={headingId} variant="subtitle1">{title}</Typography>
                    <Typography color="text.secondary" variant="body2">{description}</Typography>
                    <Stack spacing={2} sx={{ minWidth: 0, pt: 1 }}>
                        {children}
                    </Stack>
                </Stack>
            </CardContent>
        </Card>
    )
}

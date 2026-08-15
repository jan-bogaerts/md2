import { Box, Button, Stack, Typography } from '@mui/material'
import type { MouseEvent, ReactNode } from 'react'

interface MobileStatusRowProps {
    accessibleName?: string
    icon: ReactNode
    label: string
    onClick?: (event: MouseEvent<HTMLElement>) => void
    tone?: 'error.main' | 'text.secondary' | 'warning.main'
    value: string
}

/** Touch-sized status row used only by the mobile project-status section. */
export function MobileStatusRow(props: MobileStatusRowProps) {
    const { accessibleName, icon, label, onClick, tone = 'text.secondary', value } = props
    const content = (
        <>
            <Box sx={{ color: tone, display: 'flex', flexShrink: 0 }}>{icon}</Box>
            <Typography sx={{ color: 'text.secondary', flex: 1, minWidth: 0, textAlign: 'left' }} variant="body2">
                {label}
            </Typography>
            <Typography sx={{ color: tone, flexShrink: 0, fontWeight: 600, textAlign: 'right' }} variant="body2">
                {value}
            </Typography>
        </>
    )

    if (onClick) {
        return (
            <Button
                aria-label={accessibleName}
                fullWidth
                onClick={onClick}
                sx={{ borderRadius: 0, justifyContent: 'flex-start', minHeight: 40, px: 2, py: 0.75 }}
            >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', width: '100%' }}>{content}</Stack>
            </Button>
        )
    }

    return (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 40, px: 2, py: 0.75 }}>
            {content}
        </Stack>
    )
}

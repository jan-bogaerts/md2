import { Typography } from '@mui/material'
import type { ElementType, ReactNode } from 'react'

interface ActionSectionLabelProps {
    children: ReactNode
    component?: ElementType
    id?: string
}

/** Uppercase section header shared by the action editor sections, per the app style guide. */
export function ActionSectionLabel(props: ActionSectionLabelProps) {
    const { children, component = 'h3', id } = props

    return (
        <Typography
            component={component}
            id={id}
            sx={{ color: 'custom.colHead', fontSize: 11, fontWeight: 700, letterSpacing: '0.7px', lineHeight: 1.4 }}
            variant="overline"
        >
            {children}
        </Typography>
    )
}

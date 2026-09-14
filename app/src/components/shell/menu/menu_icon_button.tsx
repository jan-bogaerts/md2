import { IconButton, Tooltip } from '@mui/material'
import type { ReactNode } from 'react'

interface MenuIconButtonProps {
    children: ReactNode
    disabled?: boolean
    label: string
    onClick: () => void
    pressed?: boolean
    tooltip?: string
}

/** Tooltip-wrapped icon button used by menu sections. */
export function MenuIconButton(props: MenuIconButtonProps) {
    const { children, disabled = false, label, onClick, pressed, tooltip = label } = props

    return (
        <Tooltip title={tooltip}>
            <span>
                <IconButton
                    aria-label={label}
                    aria-pressed={pressed}
                    disabled={disabled}
                    onClick={onClick}
                    size="small"
                    sx={{ bgcolor: pressed ? 'custom.primaryBg' : undefined, color: pressed ? 'primary.main' : undefined, height: 34, width: 34 }}
                >
                    {children}
                </IconButton>
            </span>
        </Tooltip>
    )
}

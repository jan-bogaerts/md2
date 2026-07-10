import { FormControl, Select, Tooltip } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { ReactNode } from 'react'

interface MenuSelectProps {
    children: ReactNode
    disabled?: boolean
    label: string
    minWidth?: number
    onChange: (event: SelectChangeEvent) => void
    onOpen?: () => void
    value: string
}

/** Tooltip-wrapped compact select used by menu sections. */
export function MenuSelect(props: MenuSelectProps) {
    const { children, disabled = false, label, minWidth = 140, onChange, onOpen, value } = props

    return (
        <Tooltip title={label}>
            <FormControl size="small" sx={{ minWidth }}>
                <Select
                    aria-label={label}
                    disabled={disabled}
                    onChange={onChange}
                    onOpen={onOpen}
                    size="small"
                    value={value}
                >
                    {children}
                </Select>
            </FormControl>
        </Tooltip>
    )
}

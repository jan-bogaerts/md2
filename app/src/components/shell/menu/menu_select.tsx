import { FormControl, Select, Tooltip } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import { useState } from 'react'
import type { ReactNode } from 'react'

interface MenuSelectProps<Value extends string | string[]> {
    children: ReactNode
    disabled?: boolean
    errorMessage?: string | null
    label: string
    minWidth?: number
    multiple?: boolean
    onChange: (event: SelectChangeEvent<Value>) => void
    onOpen?: () => void
    renderValue?: (value: Value) => ReactNode
    value: Value
}

/** Tooltip-wrapped compact select used by menu sections. */
export function MenuSelect<Value extends string | string[] = string>(props: MenuSelectProps<Value>) {
    const {
        children,
        disabled = false,
        errorMessage = null,
        label,
        minWidth = 140,
        multiple = false,
        onChange,
        onOpen,
        renderValue,
        value,
    } = props
    const [isSelectOpen, setIsSelectOpen] = useState(false)
    const [isTooltipOpen, setIsTooltipOpen] = useState(false)

    const closeSelect = () => {
        setIsSelectOpen(false)
    }

    const closeTooltip = () => {
        setIsTooltipOpen(false)
    }

    const openSelect = () => {
        setIsSelectOpen(true)
        onOpen?.()
    }

    const openTooltip = () => {
        setIsTooltipOpen(true)
    }

    return (
        <Tooltip onClose={closeTooltip} onOpen={openTooltip} open={isTooltipOpen && !isSelectOpen} title={errorMessage ?? label}>
            <FormControl error={!!errorMessage} size="small" sx={{ minWidth }}>
                <Select<Value>
                    aria-label={label}
                    disabled={disabled}
                    displayEmpty={!!renderValue}
                    multiple={multiple}
                    onChange={onChange}
                    onClose={closeSelect}
                    onOpen={openSelect}
                    renderValue={renderValue}
                    size="small"
                    value={value}
                >
                    {children}
                </Select>
            </FormControl>
        </Tooltip>
    )
}

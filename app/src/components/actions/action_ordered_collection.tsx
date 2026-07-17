import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined'
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import { Box, FormHelperText, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { useRef, type ReactNode } from 'react'
import { ActionSectionLabel } from './action_section_label'

type MoveDirection = 'down' | 'up'

interface ActionOrderedCollectionProps<Item> {
    addControl: ReactNode
    controlLabel: string
    emptyText?: string
    error?: string
    errorIndex?: number | null
    gridTemplateColumns: { sm: string, xs: string }
    items: Item[]
    label: string
    onChange: (items: Item[]) => void
    renderFields: (item: Item, index: number, error: string | undefined) => ReactNode
    rowLabel: (index: number) => string
}

function moveItem<Item>(items: Item[], index: number, direction: MoveDirection) {
    const targetIndex = index + (direction === 'up' ? -1 : 1)
    if (targetIndex < 0 || targetIndex >= items.length) return items
    const next = [...items]
    const current = next[index]
    next[index] = next[targetIndex]
    next[targetIndex] = current

    return next
}

/** Shared ordered-row mechanics for action link and output-rule collections. */
export function ActionOrderedCollection<Item>(props: ActionOrderedCollectionProps<Item>) {
    const {
        addControl,
        controlLabel,
        emptyText,
        error,
        errorIndex,
        gridTemplateColumns,
        items,
        label,
        onChange,
        renderFields,
        rowLabel,
    } = props
    const controlsRef = useRef(new Map<string, HTMLButtonElement>())
    const hasIndexedError = !!error && errorIndex !== null && errorIndex !== undefined
    const showSectionError = !!error && (!hasIndexedError || items[errorIndex] === undefined)

    const focusControl = (index: number, control: string) => {
        queueMicrotask(() => controlsRef.current.get(`${index}:${control}`)?.focus())
    }

    const handleMove = (index: number, direction: MoveDirection) => {
        const next = moveItem(items, index, direction)
        if (next === items) return
        const targetIndex = index + (direction === 'up' ? -1 : 1)
        onChange(next)
        focusControl(targetIndex, direction)
    }

    const handleRemove = (index: number) => {
        onChange(items.filter((_item, itemIndex) => itemIndex !== index))
        const targetIndex = Math.min(index, items.length - 2)
        if (targetIndex >= 0) focusControl(targetIndex, 'remove')
    }

    const setControlRef = (index: number, control: string, element: HTMLButtonElement | null) => {
        const key = `${index}:${control}`
        if (element) controlsRef.current.set(key, element)
        else controlsRef.current.delete(key)
    }

    return (
        <Stack spacing={1}>
            <ActionSectionLabel>{label}</ActionSectionLabel>
            {showSectionError ? <FormHelperText error>{error}</FormHelperText> : null}
            {items.length === 0 && emptyText ? <Typography color="custom.text4" variant="caption">{emptyText}</Typography> : null}
            {items.map((item, index) => {
                const indexedError = hasIndexedError && errorIndex === index ? error : undefined
                const accessibleRowLabel = rowLabel(index)

                return (
                    <Box
                        aria-label={accessibleRowLabel}
                        key={accessibleRowLabel}
                        role="group"
                        sx={{
                            alignItems: 'start',
                            display: 'grid',
                            gap: 0.5,
                            gridTemplateColumns,
                            minWidth: 0,
                            '&:focus-within .action-row-actions, &:hover .action-row-actions': { opacity: 1 },
                        }}
                    >
                        {renderFields(item, index, indexedError)}
                        <Box className="action-row-actions" sx={{ display: 'flex', justifyContent: 'flex-end', opacity: 0 }}>
                            <Tooltip title={`Move ${controlLabel} up`}>
                                <span>
                                    <IconButton
                                        aria-label={`Move ${controlLabel} up`}
                                        disabled={index === 0}
                                        onClick={() => handleMove(index, 'up')}
                                        ref={(element) => setControlRef(index, 'up', element)}
                                        size="small"
                                        sx={{ '&:focus-visible, &:hover': { bgcolor: 'action.hover', color: 'primary.main' } }}
                                    >
                                        <ArrowUpwardOutlined fontSize="small" />
                                    </IconButton>
                                </span>
                            </Tooltip>
                            <Tooltip title={`Move ${controlLabel} down`}>
                                <span>
                                    <IconButton
                                        aria-label={`Move ${controlLabel} down`}
                                        disabled={index === items.length - 1}
                                        onClick={() => handleMove(index, 'down')}
                                        ref={(element) => setControlRef(index, 'down', element)}
                                        size="small"
                                        sx={{ '&:focus-visible, &:hover': { bgcolor: 'action.hover', color: 'primary.main' } }}
                                    >
                                        <ArrowDownwardOutlined fontSize="small" />
                                    </IconButton>
                                </span>
                            </Tooltip>
                            <Tooltip title={`Remove ${controlLabel}`}>
                                <IconButton
                                    aria-label={`Remove ${controlLabel}`}
                                    onClick={() => handleRemove(index)}
                                    ref={(element) => setControlRef(index, 'remove', element)}
                                    size="small"
                                    sx={{ '&:focus-visible, &:hover': { bgcolor: 'action.hover', color: 'primary.main' } }}
                                >
                                    <DeleteOutlineOutlined fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>
                )
            })}
            {addControl}
        </Stack>
    )
}

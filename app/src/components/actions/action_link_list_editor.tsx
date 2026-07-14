import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined'
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import { Box, Button, FormHelperText, IconButton, MenuItem, Stack, Tooltip, Typography } from '@mui/material'
import type { ChangeEvent, MouseEvent } from 'react'
import type { ActionDefinition } from '../../data/action_types'
import { ActionEditorField } from './action_editor_field'

interface ActionLinkListEditorProps {
    actions: ActionDefinition[]
    error?: string
    errorIndex?: number | null
    label: string
    onChange: (actionIds: string[] | undefined) => void
    value: string[] | undefined
}

export function ActionLinkListEditor(props: ActionLinkListEditorProps) {
    const { actions, error, errorIndex, label, onChange, value = [] } = props
    const hasIndexedError = !!error && errorIndex !== null && errorIndex !== undefined
    const showSectionError = !!error && (!hasIndexedError || value[errorIndex] === undefined)

    const handleAdd = () => {
        const action = actions.find(({ id }) => !value.includes(id))
        if (action) onChange([...value, action.id])
    }

    const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
        const index = Number.parseInt(event.target.name, 10)
        onChange(value.map((actionId, actionIndex) => actionIndex === index ? event.target.value : actionId))
    }

    const handleMove = (event: MouseEvent<HTMLButtonElement>) => {
        const index = Number.parseInt(event.currentTarget.dataset.index ?? '', 10)
        const offset = event.currentTarget.dataset.direction === 'up' ? -1 : 1
        const targetIndex = index + offset
        if (targetIndex < 0 || targetIndex >= value.length) return
        const next = [...value]
        const current = next[index]
        next[index] = next[targetIndex]
        next[targetIndex] = current
        onChange(next)
    }

    const handleRemove = (event: MouseEvent<HTMLButtonElement>) => {
        const index = Number.parseInt(event.currentTarget.dataset.index ?? '', 10)
        const next = value.filter((_actionId, actionIndex) => actionIndex !== index)
        onChange(next.length > 0 ? next : undefined)
    }

    return (
        <Stack spacing={1}>
            <Typography variant="subtitle2">{label}</Typography>
            {/* Section-level error so it shows even when the collection has no rendered rows. */}
            {showSectionError ? <FormHelperText error>{error}</FormHelperText> : null}
            {value.map((actionId, index) => (
                <Box
                    aria-label={`${label} action ${index + 1}`}
                    key={`${actionId}:${index}`}
                    role="group"
                    sx={{
                        alignItems: 'start',
                        display: 'grid',
                        gap: 0.5,
                        gridTemplateColumns: { sm: 'minmax(0, 1fr) auto', xs: 'minmax(0, 1fr)' },
                        minWidth: 0,
                        '&:focus-within .action-row-actions, &:hover .action-row-actions': { opacity: 1 },
                    }}
                >
                    <ActionEditorField
                        error={hasIndexedError && errorIndex === index}
                        fieldId={`action-${label.toLowerCase()}-${index}`}
                        fullWidth
                        helperText={hasIndexedError && errorIndex === index ? error : undefined}
                        label="Action"
                        name={String(index)}
                        onChange={handleSelect}
                        select
                        size="small"
                        value={actionId}
                    >
                        {!actions.some(({ id }) => id === actionId) ? (
                            <MenuItem value={actionId}>{actionId} — unavailable</MenuItem>
                        ) : null}
                        {actions.map((action) => <MenuItem key={action.id} value={action.id}>{action.label}</MenuItem>)}
                    </ActionEditorField>
                    <Box className="action-row-actions" sx={{ display: 'flex', justifyContent: 'flex-end', opacity: 0 }}>
                        <Tooltip title={`Move ${label} action up`}>
                            <span>
                                <IconButton aria-label={`Move ${label} action up`} data-direction="up" data-index={index} disabled={index === 0} onClick={handleMove} size="small" sx={{ '&:focus-visible, &:hover': { bgcolor: 'action.hover', color: 'primary.main' } }}>
                                    <ArrowUpwardOutlined fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title={`Move ${label} action down`}>
                            <span>
                                <IconButton aria-label={`Move ${label} action down`} data-direction="down" data-index={index} disabled={index === value.length - 1} onClick={handleMove} size="small" sx={{ '&:focus-visible, &:hover': { bgcolor: 'action.hover', color: 'primary.main' } }}>
                                    <ArrowDownwardOutlined fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title={`Remove ${label} action`}>
                            <IconButton aria-label={`Remove ${label} action`} data-index={index} onClick={handleRemove} size="small" sx={{ '&:focus-visible, &:hover': { bgcolor: 'action.hover', color: 'primary.main' } }}>
                                <DeleteOutlineOutlined fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
            ))}
            <Button disabled={!actions.some(({ id }) => !value.includes(id))} onClick={handleAdd} size="small" sx={{ alignSelf: 'flex-start' }} variant="outlined">Add action</Button>
        </Stack>
    )
}

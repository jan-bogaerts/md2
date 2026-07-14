import { Box, Button, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material'
import DeleteOutline from 'mdi-material-ui/DeleteOutline'
import type { ChangeEvent, MouseEvent } from 'react'
import {
    ACTION_CONTEXT_FILTER_DESCRIPTORS,
    type ActionContextFilterDescriptor,
} from '../../data/action_context'
import type { ActionAppliesTo, ActionAppliesToField } from '../../data/action_types'
import type { WorktreeRecord } from '../../data/data_types'

interface FilterOption {
    label: string
    value: string
}

interface ActionFilterEditorProps {
    cardTypes: string[]
    error?: string
    onChange: (filters: ActionAppliesTo | undefined) => void
    repositoryFiles: string[]
    specialContextTypes: string[]
    states: string[]
    value: ActionAppliesTo | undefined
    worktrees: WorktreeRecord[]
}

function uniqueOptions(values: string[]): FilterOption[] {
    return [...new Set(values)].map((value) => ({ label: value, value }))
}

function repositoryFolderNames(repositoryFiles: string[]): string[] {
    const folders = repositoryFiles.flatMap((path) => path.replace(/\\/gu, '/').split('/').slice(0, -1))

    return [...new Set(folders)]
}

function optionsForDescriptor(
    descriptor: ActionContextFilterDescriptor,
    props: ActionFilterEditorProps,
): FilterOption[] {
    const { cardTypes, repositoryFiles, specialContextTypes, states, worktrees } = props
    if (descriptor.valueSource === 'kind') return uniqueOptions(['card', 'file', 'folder'])
    if (descriptor.valueSource === 'type') return uniqueOptions([...cardTypes, ...specialContextTypes])
    if (descriptor.valueSource === 'state') return uniqueOptions(states)
    if (descriptor.valueSource === 'file') return uniqueOptions(repositoryFiles)
    if (descriptor.valueSource === 'folder') return uniqueOptions(repositoryFolderNames(repositoryFiles))
    if (descriptor.valueSource === 'worktree') {
        return worktrees.map(({ error, path }, index) => ({
            label: error ? `${index + 1} — ${path} (${error})` : `${index + 1} — ${path}`,
            value: String(index + 1),
        }))
    }

    return []
}

function includeCurrentOption(options: FilterOption[], value: string): FilterOption[] {
    if (!value || options.some((option) => option.value === value)) return options

    return [{ label: `${value} (current)`, value }, ...options]
}

function replaceEntry(
    entries: [ActionAppliesToField, string][],
    index: number,
    field: ActionAppliesToField,
    fieldValue: string,
): ActionAppliesTo {
    return Object.fromEntries(entries.map((entry, entryIndex) => (
        entryIndex === index ? [field, fieldValue] : entry
    )))
}

export function ActionFilterEditor(props: ActionFilterEditorProps) {
    const { error, onChange, value } = props
    const entries = Object.entries(value ?? {}) as [ActionAppliesToField, string][]
    const descriptorByKey = new Map(ACTION_CONTEXT_FILTER_DESCRIPTORS.map((descriptor) => [descriptor.key, descriptor]))
    const hasIncompleteRow = entries.some(([field, fieldValue]) => !field || !fieldValue)
    const hasEveryFilter = entries.length === ACTION_CONTEXT_FILTER_DESCRIPTORS.length

    const handleAdd = () => {
        const descriptor = ACTION_CONTEXT_FILTER_DESCRIPTORS.find(({ key }) => !Object.hasOwn(value ?? {}, key))
        if (!descriptor) throw new Error('No applicability filter available')
        onChange({ ...value, [descriptor.key]: '' })
    }

    const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
        const index = Number.parseInt(event.target.name, 10)
        const previousEntry = entries[index]
        if (!previousEntry) throw new Error(`Missing applicability filter at index ${index}`)

        onChange(replaceEntry(entries, index, event.target.value as ActionAppliesToField, ''))
    }

    const handleValueChange = (event: ChangeEvent<HTMLInputElement>) => {
        const index = Number.parseInt(event.target.name, 10)
        const entry = entries[index]
        if (!entry) throw new Error(`Missing applicability filter at index ${index}`)

        const [field] = entry
        onChange(replaceEntry(entries, index, field, event.target.value))
    }

    const handleRemove = (event: MouseEvent<HTMLButtonElement>) => {
        const index = Number.parseInt(event.currentTarget.dataset.index ?? '', 10)
        const entry = entries[index]
        if (!entry) throw new Error(`Missing applicability filter at index ${index}`)

        const nextEntries = entries.filter((_entry, entryIndex) => entryIndex !== index)
        onChange(nextEntries.length > 0 ? Object.fromEntries(nextEntries) : undefined)
    }

    return (
        <Stack spacing={1}>
            <Typography variant="subtitle2">Applicability filters</Typography>
            {entries.map(([field, fieldValue], index) => {
                const descriptor = descriptorByKey.get(field)
                if (!descriptor) throw new Error(`Missing applicability filter descriptor: ${field}`)
                const valueError = descriptor.validate(fieldValue)
                const options = includeCurrentOption(optionsForDescriptor(descriptor, props), fieldValue)

                return (
                    <Box key={index} sx={{ alignItems: 'flex-start', display: 'flex', gap: 1 }}>
                        <Stack spacing={1} sx={{ flex: 1 }}>
                            <TextField
                                label="Context field"
                                name={String(index)}
                                onChange={handleFieldChange}
                                select
                                size="small"
                                value={field}
                            >
                                {ACTION_CONTEXT_FILTER_DESCRIPTORS.map((option) => (
                                    <MenuItem
                                        disabled={Object.hasOwn(value ?? {}, option.key) && option.key !== field}
                                        key={option.key}
                                        value={option.key}
                                    >
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Stack>
                        <TextField
                            error={!!valueError || !!error}
                            helperText={valueError ?? error}
                            label={descriptor.label}
                            name={String(index)}
                            onChange={handleValueChange}
                            select={descriptor.valueSource !== 'text'}
                            size="small"
                            sx={{ flex: 1 }}
                            value={fieldValue}
                        >
                            {options.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                        </TextField>
                        <Tooltip title={`Remove ${field || 'custom'} filter`}>
                            <IconButton aria-label={`Remove ${field || 'custom'} filter`} data-index={index} onClick={handleRemove} size="small">
                                <DeleteOutline fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                )
            })}
            <Button disabled={hasIncompleteRow || hasEveryFilter} onClick={handleAdd} size="small" sx={{ alignSelf: 'flex-start' }}>
                Add filter
            </Button>
        </Stack>
    )
}

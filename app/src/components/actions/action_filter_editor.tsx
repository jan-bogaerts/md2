import { Box, Button, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material'
import DeleteOutline from 'mdi-material-ui/DeleteOutline'
import { useState } from 'react'
import type { ChangeEvent, MouseEvent } from 'react'
import {
    ACTION_CONTEXT_FILTER_DESCRIPTORS,
    type ActionContextFilterDescriptor,
} from '../../data/action_context'
import type { ActionAppliesTo } from '../../data/action_types'
import type { WorktreeRecord } from '../../data/data_types'

const CUSTOM_FIELD_VALUE = '__custom_context_field__'

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

function replaceEntry(entries: [string, string][], index: number, field: string, fieldValue: string): ActionAppliesTo {
    return Object.fromEntries(entries.map((entry, entryIndex) => (
        entryIndex === index ? [field, fieldValue] : entry
    )))
}

export function ActionFilterEditor(props: ActionFilterEditorProps) {
    const { error, onChange, value } = props
    const entries = Object.entries(value ?? {})
    const [customKeyDraft, setCustomKeyDraft] = useState('')
    const descriptorByKey = new Map(ACTION_CONTEXT_FILTER_DESCRIPTORS.map((descriptor) => [descriptor.key, descriptor]))
    const hasIncompleteRow = entries.some(([field, fieldValue]) => !field || !fieldValue)

    const handleAdd = () => {
        const descriptor = ACTION_CONTEXT_FILTER_DESCRIPTORS.find(({ key }) => !Object.hasOwn(value ?? {}, key))
        const field = descriptor?.key ?? ''
        onChange({ ...value, [field]: '' })
    }

    const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
        const index = Number.parseInt(event.target.name, 10)
        const previousEntry = entries[index]
        if (!previousEntry) throw new Error(`Missing applicability filter at index ${index}`)

        const nextField = event.target.value
        const field = nextField === CUSTOM_FIELD_VALUE ? '' : nextField
        setCustomKeyDraft('')
        onChange(replaceEntry(entries, index, field, ''))
    }

    const handleCustomKeyChange = (event: ChangeEvent<HTMLInputElement>) => {
        const index = Number.parseInt(event.target.name, 10)
        const entry = entries[index]
        if (!entry) throw new Error(`Missing applicability filter at index ${index}`)

        const [field, fieldValue] = entry
        const nextField = event.target.value
        const duplicate = entries.some(([candidate], entryIndex) => candidate === nextField && entryIndex !== index)
        const structured = descriptorByKey.has(nextField)
        setCustomKeyDraft(nextField)

        if (!nextField || duplicate || structured) {
            if (field) onChange(replaceEntry(entries, index, '', fieldValue))
            return
        }

        setCustomKeyDraft('')
        onChange(replaceEntry(entries, index, nextField, fieldValue))
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
        if (!entry[0]) setCustomKeyDraft('')

        const nextEntries = entries.filter((_entry, entryIndex) => entryIndex !== index)
        onChange(nextEntries.length > 0 ? Object.fromEntries(nextEntries) : undefined)
    }

    return (
        <Stack spacing={1}>
            <Typography variant="subtitle2">Applicability filters</Typography>
            {entries.map(([field, fieldValue], index) => {
                const descriptor = descriptorByKey.get(field)
                const isCustom = !descriptor
                const customKey = field || customKeyDraft
                const duplicateCustomKey = !!customKey && entries.some(([candidate], entryIndex) => (
                    candidate === customKey && entryIndex !== index
                ))
                const structuredCustomKey = !!customKey && descriptorByKey.has(customKey)
                const keyError = !customKey
                    ? 'Context field is required'
                    : duplicateCustomKey
                        ? 'Context field already exists'
                        : structuredCustomKey ? 'Choose this field from the structured field list' : null
                const valueError = descriptor?.validate(fieldValue) ?? (fieldValue ? null : 'Required value')
                const options = descriptor ? includeCurrentOption(optionsForDescriptor(descriptor, props), fieldValue) : []
                const selectValue = descriptor ? field : CUSTOM_FIELD_VALUE

                return (
                    <Box key={index} sx={{ alignItems: 'flex-start', display: 'flex', gap: 1 }}>
                        <Stack spacing={1} sx={{ flex: 1 }}>
                            <TextField
                                label="Context field"
                                name={String(index)}
                                onChange={handleFieldChange}
                                select
                                size="small"
                                value={selectValue}
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
                                <MenuItem value={CUSTOM_FIELD_VALUE}>Custom field</MenuItem>
                            </TextField>
                            {isCustom ? (
                                <TextField
                                    error={!!keyError}
                                    helperText={keyError}
                                    label="Custom context field"
                                    name={String(index)}
                                    onChange={handleCustomKeyChange}
                                    size="small"
                                    value={customKey}
                                />
                            ) : null}
                        </Stack>
                        <TextField
                            error={!!valueError || !!error}
                            helperText={valueError ?? error}
                            label={descriptor?.label ?? 'Custom value'}
                            name={String(index)}
                            onChange={handleValueChange}
                            select={!!descriptor && descriptor.valueSource !== 'text'}
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
            <Button disabled={hasIncompleteRow} onClick={handleAdd} size="small" sx={{ alignSelf: 'flex-start' }}>
                Add filter
            </Button>
        </Stack>
    )
}

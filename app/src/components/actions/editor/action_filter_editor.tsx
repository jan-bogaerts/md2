import AddOutlined from '@mui/icons-material/AddOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import { Box, Button, IconButton, MenuItem, Stack, Tooltip, Typography } from '@mui/material'
import { useEffect, useState, type ChangeEvent, type MouseEvent } from 'react'
import {
    ACTION_CONTEXT_FILTER_DESCRIPTORS,
    type ActionContextFilterDescriptor,
} from '../../../data/action_context'
import type { ActionAppliesTo, ActionAppliesToField } from '../../../data/action_types'
import type { WorktreeRecord } from '../../../data/data_types'
import { dialogService } from '../../../services/dialog_service'
import { ActionEditorField } from './action_editor_field'
import { ActionSectionLabel } from '../shared/action_section_label'
import { ActionEditorTextField } from './action_editor_text_field'

interface FilterOption {
    label: string
    value: string
}

interface PendingFilter {
    field: ActionAppliesToField
    index: number
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
    if (descriptor.valueSource === 'kind') return uniqueOptions(['card', 'diagram', 'file', 'folder', 'merge-conflict', 'project'])
    if (descriptor.valueSource === 'type') return uniqueOptions([...cardTypes, 'root', 'child', ...specialContextTypes])
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
    const [pendingFilter, setPendingFilter] = useState<PendingFilter | null>(null)
    const persistedEntries = Object.entries(value ?? {}) as [ActionAppliesToField, string][]
    const entries: [ActionAppliesToField, string][] = pendingFilter
        ? persistedEntries.map((entry, index) => index === pendingFilter.index ? [pendingFilter.field, ''] : entry)
        : persistedEntries
    if (pendingFilter?.index === persistedEntries.length) entries.push([pendingFilter.field, ''])
    const descriptorByKey = new Map(ACTION_CONTEXT_FILTER_DESCRIPTORS.map((descriptor) => [descriptor.key, descriptor]))
    const missingDescriptorFields = entries
        .map(([field]) => field)
        .filter((field) => !descriptorByKey.has(field))
    const missingDescriptorMessage = missingDescriptorFields.length > 0
        ? `Missing applicability filter descriptor: ${missingDescriptorFields.join(', ')}`
        : null
    const hasIncompleteRow = entries.some(([field, fieldValue]) => !field || !fieldValue)
    const hasEveryFilter = entries.length === ACTION_CONTEXT_FILTER_DESCRIPTORS.length

    useEffect(() => {
        if (missingDescriptorMessage) dialogService.error(missingDescriptorMessage)
    }, [missingDescriptorMessage])

    const handleAdd = () => {
        try {
            const descriptor = ACTION_CONTEXT_FILTER_DESCRIPTORS.find(({ key }) => !entries.some(([field]) => field === key))
            if (!descriptor) throw new Error('No applicability filter available')
            setPendingFilter({ field: descriptor.key, index: entries.length })
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Applicability filter could not be added' })
        }
    }

    const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
        try {
            const index = Number.parseInt(event.target.name, 10)
            const previousEntry = entries[index]
            if (!previousEntry) throw new Error(`Missing applicability filter at index ${index}`)

            setPendingFilter({ field: event.target.value as ActionAppliesToField, index })
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Applicability filter field could not be changed' })
        }
    }

    const handleValueChange = (event: ChangeEvent<HTMLInputElement>) => {
        try {
            const index = Number.parseInt(event.target.name, 10)
            const entry = entries[index]
            if (!entry) throw new Error(`Missing applicability filter at index ${index}`)

            const [field] = entry
            const nextFilters = index === persistedEntries.length
                ? { ...value, [field]: event.target.value }
                : replaceEntry(persistedEntries, index, field, event.target.value)
            onChange(nextFilters)
            setPendingFilter(null)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Applicability filter value could not be changed' })
        }
    }

    const handleRemove = (event: MouseEvent<HTMLButtonElement>) => {
        try {
            const index = Number.parseInt(event.currentTarget.dataset.index ?? '', 10)
            const entry = entries[index]
            if (!entry) throw new Error(`Missing applicability filter at index ${index}`)

            const nextEntries = persistedEntries.filter((_entry, entryIndex) => entryIndex !== index)
            setPendingFilter(null)
            if (pendingFilter?.index === persistedEntries.length) return
            onChange(nextEntries.length > 0 ? Object.fromEntries(nextEntries) : undefined)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Applicability filter could not be removed' })
        }
    }

    return (
        <Stack spacing={1}>
            <ActionSectionLabel>Applicability filters</ActionSectionLabel>
            {entries.length === 0 ? (
                <Typography color="custom.text4" variant="caption">
                    No filters. The action is available in every context.
                </Typography>
            ) : null}
            {entries.map(([field, fieldValue], index) => {
                const descriptor = descriptorByKey.get(field)
                if (!descriptor) return null
                const valueError = pendingFilter?.index === index ? null : descriptor.validate(fieldValue)
                const options = includeCurrentOption(optionsForDescriptor(descriptor, props), fieldValue)

                return (
                    <Box
                        aria-label={'Applicability filter ' + (index + 1)}
                        key={index}
                        role="group"
                        sx={{
                            alignItems: 'start',
                            display: 'grid',
                            gap: 1,
                            gridTemplateColumns: { sm: 'minmax(0, 1fr) minmax(0, 1fr) auto', xs: 'minmax(0, 1fr)' },
                            minWidth: 0,
                            '&:focus-within .action-row-actions, &:hover .action-row-actions': { opacity: 1 },
                        }}
                    >
                        <ActionEditorField
                            fieldId={'action-filter-field-' + index}
                            label="Context field"
                            name={String(index)}
                            onChange={handleFieldChange}
                            select
                            size="small"
                            value={field}
                        >
                            {ACTION_CONTEXT_FILTER_DESCRIPTORS.map((option) => (
                                <MenuItem
                                    disabled={entries.some(([entryField]) => entryField === option.key) && option.key !== field}
                                    key={option.key}
                                    value={option.key}
                                >
                                    {option.label}
                                </MenuItem>
                            ))}
                        </ActionEditorField>
                        {descriptor.valueSource === 'text' ? (
                            <ActionEditorTextField
                                error={!!valueError || !!error}
                                fieldId={'action-filter-value-' + index}
                                helperText={valueError ?? error}
                                label={descriptor.label}
                                name={String(index)}
                                onChange={handleValueChange}
                                size="small"
                                source={value as ActionAppliesTo}
                                value={fieldValue}
                            />
                        ) : (
                            <ActionEditorField
                                error={!!valueError || !!error}
                                fieldId={'action-filter-value-' + index}
                                helperText={valueError ?? error}
                                label={descriptor.label}
                                name={String(index)}
                                onChange={handleValueChange}
                                select
                                size="small"
                                value={fieldValue}
                            >
                                {options.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                            </ActionEditorField>
                        )}
                        <Box className="action-row-actions" sx={{ display: 'flex', justifyContent: 'flex-end', opacity: 0 }}>
                            <Tooltip title={`Remove ${field || 'custom'} filter`}>
                                <IconButton
                                    aria-label={`Remove ${field || 'custom'} filter`}
                                    data-index={index}
                                    onClick={handleRemove}
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
            <Button disabled={hasIncompleteRow || hasEveryFilter} onClick={handleAdd} size="small" startIcon={<AddOutlined />} sx={{ alignSelf: 'flex-start' }} variant="outlined">
                Add filter
            </Button>
        </Stack>
    )
}

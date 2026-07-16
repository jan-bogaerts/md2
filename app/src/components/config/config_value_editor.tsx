import {
    Box,
    FormControl,
    FormControlLabel,
    FormHelperText,
    FormLabel,
    InputLabel,
    MenuItem,
    Select,
    Slider,
    Switch,
    TextField,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import { Fragment, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { ConfigEntry, ConfigValue } from '../../services/config_service'
import { defaultModelForProfile, findAgentProfile, mergeAgentProfiles, type AgentProfile } from '../../data/agent_profiles'
import { AgentProfilesEditor } from './agent_profiles_editor'

const CONFIG_PLACEHOLDER_PARTS_PATTERN = /(\{\{[^{}]+\}\})/u
const CONFIG_PLACEHOLDER_PATTERN = /^\{\{[^{}]+\}\}$/u
const MULTILINE_CONFIG_FIELD_MIN_ROWS = 6
const OUTLINED_FIELD_BLOCK_SX = { border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }
const MONOSPACE_INPUT_SLOT_PROPS = { htmlInput: { style: { fontFamily: 'monospace' } } }
const MONOSPACE_CONFIG_KEYS = new Set<ConfigEntry['key']>([
    'project.cardBodyTemplate',
    'project.cardTypes',
    'project.diffCommand',
    'project.states',
])

interface ConfigValueEditorProps {
    disabled?: boolean
    entry: ConfigEntry
    onChange: (key: ConfigEntry['key'], value: unknown) => void
    onValidityChange?: (key: ConfigEntry['key'], valid: boolean) => void
    value: ConfigValue
    values?: Partial<Record<ConfigEntry['key'], ConfigValue>>
}

function renderDescription(description: string) {
    return description.split(CONFIG_PLACEHOLDER_PARTS_PATTERN).map((descriptionPart, index) => {
        if (!CONFIG_PLACEHOLDER_PATTERN.test(descriptionPart)) {
            return <Fragment key={`${descriptionPart}-${index}`}>{descriptionPart}</Fragment>
        }

        return (
            <Box component="code" key={`${descriptionPart}-${index}`} sx={{ bgcolor: 'action.hover', borderRadius: 0.5, px: 0.5 }}>
                {descriptionPart}
            </Box>
        )
    })
}

export function ConfigValueEditor(props: ConfigValueEditorProps) {
    const { disabled = false, entry, onChange, onValidityChange, value, values } = props
    const [jsonText, setJsonText] = useState(() => (entry.type === 'json' ? JSON.stringify(value, null, 2) : ''))
    const agentProfiles = mergeAgentProfiles((values?.['desktop.agentProfiles'] ?? []) as AgentProfile[])
    const selectedAgentProfile = entry.key === 'desktop.model'
        ? findAgentProfile(agentProfiles, (values?.['desktop.agent'] ?? '') as string)
        : null
    const selectedAgentModels = selectedAgentProfile?.models ?? []
    const selectOptions = entry.key === 'desktop.agent'
        ? agentProfiles.map((profile) => ({ label: profile.name, value: profile.name }))
        : entry.key === 'desktop.model' && selectedAgentModels.length > 0
            ? selectedAgentModels.map((model) => ({ label: model, value: model }))
            : entry.type === 'select'
                ? entry.options ?? []
                : null
    const stringValue = value as string
    const selectValue = entry.key === 'desktop.model' && selectedAgentModels.length > 0 && stringValue.length === 0
        ? defaultModelForProfile(selectedAgentProfile as AgentProfile)
        : stringValue
    const helperTextId = `${entry.key}-helper-text`
    const selectLabelId = `${entry.key}-label`
    const description = renderDescription(entry.description)
    const isMultilineString = entry.key === 'project.cardBodyTemplate'
    const usesMonospace = MONOSPACE_CONFIG_KEYS.has(entry.key)

    const handleBooleanChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange(entry.key, event.target.checked)
    }

    const handleNumberChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange(entry.key, Number(event.target.value))
    }

    const handleSliderChange = (_event: Event, nextValue: number | number[]) => {
        onChange(entry.key, nextValue)
    }

    const handleStringChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange(entry.key, event.target.value)
    }

    const handleSelectChange = (event: SelectChangeEvent) => {
        onChange(entry.key, event.target.value)
    }

    const handleJsonChange = (event: ChangeEvent<HTMLInputElement>) => {
        setJsonText(event.target.value)
    }

    const handleJsonBlur = () => {
        onChange(entry.key, JSON.parse(jsonText))
    }

    const handleAgentProfilesChange = (nextValue: AgentProfile[]) => {
        onChange(entry.key, nextValue)
    }

    const handleAgentProfilesValidityChange = (valid: boolean) => {
        onValidityChange?.(entry.key, valid)
    }

    if (entry.type === 'number' && entry.input === 'slider' && (entry.min === undefined || entry.max === undefined)) {
        throw new Error(`Slider config entry ${entry.key} requires min and max`)
    }

    if (entry.type === 'boolean') {
        return (
            <FormControl disabled={disabled} fullWidth sx={OUTLINED_FIELD_BLOCK_SX}>
                <FormControlLabel
                    control={(
                        <Switch
                            checked={value as boolean}
                            disabled={disabled}
                            onChange={handleBooleanChange}
                            slotProps={{ input: { 'aria-describedby': helperTextId } }}
                        />
                    )}
                    label={entry.label}
                    sx={{ m: 0 }}
                />
                <FormHelperText id={helperTextId} sx={{ m: 0, mt: 1 }}>{description}</FormHelperText>
            </FormControl>
        )
    }

    if (selectOptions) {
        return (
            <FormControl disabled={disabled} fullWidth variant="outlined">
                <InputLabel id={selectLabelId}>{entry.label}</InputLabel>
                <Select
                    aria-describedby={helperTextId}
                    label={entry.label}
                    labelId={selectLabelId}
                    onChange={handleSelectChange}
                    value={selectValue}
                >
                    {selectOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                    ))}
                </Select>
                <FormHelperText id={helperTextId}>{description}</FormHelperText>
            </FormControl>
        )
    }

    if (entry.type === 'number' && entry.input === 'slider') {
        return (
            <FormControl disabled={disabled} fullWidth sx={OUTLINED_FIELD_BLOCK_SX}>
                <FormLabel htmlFor={entry.key}>{entry.label}</FormLabel>
                <Slider
                    aria-label={entry.label}
                    aria-describedby={helperTextId}
                    disabled={disabled}
                    id={entry.key}
                    max={entry.max}
                    min={entry.min}
                    onChange={handleSliderChange}
                    step={entry.step}
                    value={value as number}
                    valueLabelDisplay="auto"
                />
                <FormHelperText id={helperTextId} sx={{ m: 0 }}>{description}</FormHelperText>
            </FormControl>
        )
    }

    if (entry.type === 'number') {
        return (
            <TextField
                disabled={disabled}
                fullWidth
                helperText={description}
                label={entry.label}
                onChange={handleNumberChange}
                slotProps={{ htmlInput: { max: entry.max, min: entry.min } }}
                type="number"
                value={value as number}
                variant="outlined"
            />
        )
    }

    if (entry.key === 'desktop.agentProfiles') {
        return (
            <FormControl disabled={disabled} fullWidth sx={OUTLINED_FIELD_BLOCK_SX}>
                <FormLabel>{entry.label}</FormLabel>
                <Box sx={{ mt: 2 }}>
                    <AgentProfilesEditor
                        disabled={disabled}
                        onChange={handleAgentProfilesChange}
                        onValidityChange={handleAgentProfilesValidityChange}
                        value={value as AgentProfile[]}
                    />
                </Box>
                <FormHelperText sx={{ m: 0, mt: 1 }}>{description}</FormHelperText>
            </FormControl>
        )
    }

    if (entry.type === 'json') {
        return (
            <TextField
                disabled={disabled}
                fullWidth
                helperText={description}
                label={entry.label}
                minRows={MULTILINE_CONFIG_FIELD_MIN_ROWS}
                multiline
                onBlur={handleJsonBlur}
                onChange={handleJsonChange}
                slotProps={MONOSPACE_INPUT_SLOT_PROPS}
                value={jsonText}
                variant="outlined"
            />
        )
    }

    return (
        <TextField
            disabled={disabled}
            fullWidth
            helperText={description}
            label={entry.label}
            minRows={isMultilineString ? MULTILINE_CONFIG_FIELD_MIN_ROWS : undefined}
            multiline={isMultilineString}
            onChange={handleStringChange}
            slotProps={usesMonospace ? MONOSPACE_INPUT_SLOT_PROPS : undefined}
            value={stringValue}
            variant="outlined"
        />
    )
}

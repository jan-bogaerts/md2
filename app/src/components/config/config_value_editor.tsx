import { FormControl, FormControlLabel, MenuItem, Select, Stack, Switch, TextField, Typography } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useState } from 'react'
import type { ConfigEntry, ConfigValue } from '../../services/config_service'
import { defaultModelForProfile, findAgentProfile, mergeAgentProfiles, type AgentProfile } from '../../data/agent_profiles'
import { AgentProfilesEditor } from './agent_profiles_editor'

interface ConfigValueEditorProps {
    disabled?: boolean
    entry: ConfigEntry
    onChange: (key: ConfigEntry['key'], value: unknown) => void
    onValidityChange?: (key: ConfigEntry['key'], valid: boolean) => void
    value: ConfigValue
    values?: Partial<Record<ConfigEntry['key'], ConfigValue>>
}

export function ConfigValueEditor(props: ConfigValueEditorProps) {
    const { disabled = false, entry, onChange, onValidityChange, value, values } = props
    const [jsonText, setJsonText] = useState(() => (entry.type === 'json' ? JSON.stringify(value, null, 2) : ''))
    const agentProfiles = mergeAgentProfiles((values?.['desktop.agentProfiles'] ?? []) as AgentProfile[])
    const selectedAgentProfile = entry.key === 'desktop.model'
        ? findAgentProfile(agentProfiles, (values?.['desktop.agent'] ?? '') as string)
        : null
    const selectedAgentModels = selectedAgentProfile?.models ?? []

    const handleBooleanChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange(entry.key, event.target.checked)
    }

    const handleNumberChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange(entry.key, Number(event.target.value))
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

    const control = entry.type === 'boolean' ? (
        <FormControlLabel
            control={<Switch checked={value as boolean} disabled={disabled} onChange={handleBooleanChange} />}
            label={entry.label}
        />
    ) : entry.key === 'desktop.agent' ? (
        <FormControl fullWidth size="small">
            <Select aria-label={entry.label} disabled={disabled} onChange={handleSelectChange} value={value as string}>
                {agentProfiles.map((profile) => (
                    <MenuItem key={profile.name} value={profile.name}>{profile.name}</MenuItem>
                ))}
            </Select>
        </FormControl>
    ) : entry.key === 'desktop.model' && selectedAgentModels.length > 0 ? (
        <FormControl fullWidth size="small">
            <Select
                aria-label={entry.label}
                disabled={disabled}
                onChange={handleSelectChange}
                value={(value as string) || defaultModelForProfile(selectedAgentProfile as AgentProfile)}
            >
                {selectedAgentModels.map((model) => (
                    <MenuItem key={model} value={model}>{model}</MenuItem>
                ))}
            </Select>
        </FormControl>
    ) : entry.type === 'select' ? (
        <FormControl fullWidth size="small">
            <Select aria-label={entry.label} disabled={disabled} onChange={handleSelectChange} value={value as string}>
                {entry.options?.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
            </Select>
        </FormControl>
    ) : entry.type === 'number' ? (
        <TextField
            fullWidth
            disabled={disabled}
            label={entry.label}
            onChange={handleNumberChange}
            size="small"
            slotProps={{ htmlInput: { max: entry.max, min: entry.min } }}
            type="number"
            value={value as number}
        />
    ) : entry.key === 'desktop.agentProfiles' ? (
        <AgentProfilesEditor
            disabled={disabled}
            onChange={handleAgentProfilesChange}
            onValidityChange={handleAgentProfilesValidityChange}
            value={value as AgentProfile[]}
        />
    ) : entry.type === 'json' ? (
        <TextField
            fullWidth
            disabled={disabled}
            label={entry.label}
            multiline
            onBlur={handleJsonBlur}
            onChange={handleJsonChange}
            size="small"
            value={jsonText}
        />
    ) : (
        <TextField disabled={disabled} fullWidth label={entry.label} multiline onChange={handleStringChange} size="small" value={value as string} />
    )

    return (
        <Stack spacing={1}>
            {control}
            <Typography color="text.secondary" variant="body2">
                {entry.description}
            </Typography>
        </Stack>
    )
}

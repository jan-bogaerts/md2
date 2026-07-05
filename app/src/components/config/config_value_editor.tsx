import { FormControl, FormControlLabel, MenuItem, Select, Stack, Switch, TextField, Typography } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useState } from 'react'
import type { ConfigEntry, ConfigValue } from '../../services/config_service'

interface ConfigValueEditorProps {
    entry: ConfigEntry
    onChange: (key: ConfigEntry['key'], value: unknown) => void
    value: ConfigValue
}

export function ConfigValueEditor(props: ConfigValueEditorProps) {
    const { entry, onChange, value } = props
    const [jsonText, setJsonText] = useState(() => (entry.type === 'json' ? JSON.stringify(value, null, 2) : ''))

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

    const control = entry.type === 'boolean' ? (
        <FormControlLabel control={<Switch checked={value as boolean} onChange={handleBooleanChange} />} label={entry.label} />
    ) : entry.type === 'select' ? (
        <FormControl fullWidth size="small">
            <Select aria-label={entry.label} onChange={handleSelectChange} value={value as string}>
                {entry.options?.map((option) => (
                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
            </Select>
        </FormControl>
    ) : entry.type === 'number' ? (
        <TextField
            fullWidth
            label={entry.label}
            onChange={handleNumberChange}
            size="small"
            slotProps={{ htmlInput: { max: entry.max, min: entry.min } }}
            type="number"
            value={value as number}
        />
    ) : entry.type === 'json' ? (
        <TextField
            fullWidth
            label={entry.label}
            multiline
            onBlur={handleJsonBlur}
            onChange={handleJsonChange}
            size="small"
            value={jsonText}
        />
    ) : (
        <TextField fullWidth label={entry.label} multiline onChange={handleStringChange} size="small" value={value as string} />
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

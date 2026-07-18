import { Paper, Stack, Typography } from '@mui/material'
import type { ConfigEntry, ConfigKey, ConfigValues } from '../../services/config/config_service'
import { ConfigValueEditor } from './config_value_editor'

const CONFIG_SECTION_PADDING = 3
const CONFIG_SECTION_SCROLL_MARGIN_TOP = 3

interface ConfigSectionLayoutProps {
    disabled?: boolean
    draft: ConfigValues
    entries: ConfigEntry[]
    id: string
    label: string
    onChange: (key: ConfigKey, value: unknown) => void
    onValidityChange: (key: ConfigKey, valid: boolean) => void
}

export function ConfigSectionLayout(props: ConfigSectionLayoutProps) {
    const { disabled = false, draft, entries, id, label, onChange, onValidityChange } = props
    const headingId = `${id}-config-heading`

    return (
        <Paper
            aria-labelledby={headingId}
            component="section"
            id={id}
            sx={{ p: CONFIG_SECTION_PADDING, scrollMarginTop: CONFIG_SECTION_SCROLL_MARGIN_TOP }}
            variant="outlined"
        >
            <Stack spacing={3}>
                <Typography component="h3" id={headingId} variant="h6">
                    {label}
                </Typography>
                {entries.map((entry) => (
                    <ConfigValueEditor
                        disabled={disabled}
                        entry={entry}
                        key={entry.key}
                        onChange={onChange}
                        onValidityChange={onValidityChange}
                        value={draft[entry.key]}
                        values={draft}
                    />
                ))}
            </Stack>
        </Paper>
    )
}

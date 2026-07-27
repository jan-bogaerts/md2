import { FormControl, FormHelperText, InputLabel, MenuItem, Paper, Select, Stack, Typography } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import {
    MARKDOWN_SECTIONS,
    MARKDOWN_STYLE_NAMES,
    MARKDOWN_STYLE_PRESETS,
    cloneMarkdownStyleConfig,
    isMarkdownStylePresetName,
    type MarkdownSection,
    type MarkdownSectionStyle,
    type MarkdownStyleConfig,
    type MarkdownStyleName,
} from '../../theme/theme_config'
import { dialogService } from '../../services/dialog_service'
import { MarkdownSectionEditor } from './markdown_section_editor'
import { MarkdownStylePreview } from './markdown_style_preview'

const MARKDOWN_SECTION_LABELS: Record<MarkdownSection, string> = {
    title1: 'Title 1',
    title2: 'Title 2',
    title3: 'Title 3',
    body: 'Body',
    caption: 'Caption',
    link: 'Links',
    list: 'Lists',
    blockquote: 'Blockquotes',
    inlineCode: 'Inline code',
    codeBlock: 'Code blocks',
    table: 'Tables',
}

const MARKDOWN_CONFIG_SECTION_PADDING = 3
const REPLACE_CUSTOM_STYLE_MESSAGE = 'Replace custom Markdown settings with the selected predefined style?'

interface MarkdownConfigSectionProps {
    config: MarkdownStyleConfig
    name: MarkdownStyleName
    onChange: (name: MarkdownStyleName, config: MarkdownStyleConfig) => void
}

function styleNameLabel(name: MarkdownStyleName) {
    if (name === 'sans-serif') return 'Sans serif'

    return name.charAt(0).toUpperCase() + name.slice(1)
}

export function MarkdownConfigSection(props: MarkdownConfigSectionProps) {
    const { config, name, onChange } = props

    const handleStyleNameChange = (event: SelectChangeEvent) => {
        try {
            const nextName = event.target.value as MarkdownStyleName
            if (nextName === 'custom') {
                onChange(nextName, cloneMarkdownStyleConfig(config))
                return
            }
            if (!isMarkdownStylePresetName(nextName)) throw new Error(`Unknown markdown style: ${nextName}`)
            if (name === 'custom' && !window.confirm(REPLACE_CUSTOM_STYLE_MESSAGE)) return

            onChange(nextName, cloneMarkdownStyleConfig(MARKDOWN_STYLE_PRESETS[nextName]))
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Markdown style could not be changed' })
        }
    }

    const handleSectionChange = (section: MarkdownSection, style: MarkdownSectionStyle) => {
        const nextConfig = { ...config, [section]: style }
        onChange('custom', nextConfig)
    }

    return (
        <Paper
            aria-labelledby="markdown-config-heading"
            component="section"
            sx={{ p: MARKDOWN_CONFIG_SECTION_PADDING }}
            variant="outlined"
        >
            <Stack spacing={3}>
                <Typography component="h3" id="markdown-config-heading" variant="h6">Markdown</Typography>
                <FormControl fullWidth>
                    <InputLabel id="markdown-style-name-label">Style</InputLabel>
                    <Select
                        aria-describedby="markdown-style-name-helper-text"
                        label="Style"
                        labelId="markdown-style-name-label"
                        onChange={handleStyleNameChange}
                        value={name}
                    >
                        {MARKDOWN_STYLE_NAMES.map((styleName) => (
                            <MenuItem key={styleName} value={styleName}>{styleNameLabel(styleName)}</MenuItem>
                        ))}
                    </Select>
                    <FormHelperText id="markdown-style-name-helper-text">
                        Editing a predefined style creates a custom global style.
                    </FormHelperText>
                </FormControl>
                <MarkdownStylePreview config={config} />
                <Stack spacing={1}>
                    {MARKDOWN_SECTIONS.map((section) => (
                        <MarkdownSectionEditor
                            key={section}
                            label={MARKDOWN_SECTION_LABELS[section]}
                            onChange={handleSectionChange}
                            section={section}
                            style={config[section]}
                        />
                    ))}
                </Stack>
            </Stack>
        </Paper>
    )
}

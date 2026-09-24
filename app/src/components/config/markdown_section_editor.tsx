import {
    Box,
    FormControlLabel,
    Popover,
    Stack,
    Switch,
    TextField,
    Typography,
} from '@mui/material'
import type { ChangeEvent } from 'react'
import type { MarkdownSection, MarkdownSectionStyle } from '../../theme/theme_config'

type MarkdownStyleTextField = 'color' | 'fontFamily' | 'fontSize' | 'lineHeight' | 'marginBottom' | 'marginTop'
type MarkdownStyleFormattingField = keyof MarkdownSectionStyle['formatting']

interface MarkdownSectionEditorProps {
    anchorElement: HTMLElement
    label: string
    onChange: (section: MarkdownSection, style: MarkdownSectionStyle) => void
    onClose: () => void
    section: MarkdownSection
    style: MarkdownSectionStyle
}

/** Live style editor for one markdown section, shown as a popover anchored to its preview element. */
export function MarkdownSectionEditor(props: MarkdownSectionEditorProps) {
    const { anchorElement, label, onChange, onClose, section, style } = props

    const handleTextChange = (event: ChangeEvent<HTMLInputElement>) => {
        const field = event.target.name as MarkdownStyleTextField
        onChange(section, { ...style, [field]: event.target.value })
    }

    const handleFormattingChange = (event: ChangeEvent<HTMLInputElement>) => {
        const field = event.target.name as MarkdownStyleFormattingField
        onChange(section, { ...style, formatting: { ...style.formatting, [field]: event.target.checked } })
    }

    return (
        <Popover anchorEl={anchorElement} onClose={onClose} open>
            <Box sx={{ maxHeight: '70vh', overflowY: 'auto', p: 2, width: 480 }}>
                <Stack spacing={2}>
                    <Typography component="h4" variant="subtitle2">{`${label} style`}</Typography>
                    <TextField
                        fullWidth
                        label={`Font family for ${label}`}
                        name="fontFamily"
                        onChange={handleTextChange}
                        required
                        value={style.fontFamily}
                    />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                            fullWidth
                            label={`Font size for ${label}`}
                            name="fontSize"
                            onChange={handleTextChange}
                            required
                            value={style.fontSize}
                        />
                        <TextField
                            fullWidth
                            label={`Line height for ${label}`}
                            name="lineHeight"
                            onChange={handleTextChange}
                            required
                            value={style.lineHeight}
                        />
                        <TextField
                            fullWidth
                            label={`Color for ${label}`}
                            name="color"
                            onChange={handleTextChange}
                            required
                            value={style.color}
                        />
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                            fullWidth
                            label={`Space before ${label}`}
                            name="marginTop"
                            onChange={handleTextChange}
                            required
                            value={style.marginTop}
                        />
                        <TextField
                            fullWidth
                            label={`Space after ${label}`}
                            name="marginBottom"
                            onChange={handleTextChange}
                            required
                            value={style.marginBottom}
                        />
                    </Stack>
                    <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
                        <FormControlLabel
                            control={<Switch checked={style.formatting.bold} name="bold" onChange={handleFormattingChange} />}
                            label="Bold"
                        />
                        <FormControlLabel
                            control={<Switch checked={style.formatting.italic} name="italic" onChange={handleFormattingChange} />}
                            label="Italic"
                        />
                        <FormControlLabel
                            control={<Switch checked={style.formatting.underline} name="underline" onChange={handleFormattingChange} />}
                            label="Underline"
                        />
                    </Stack>
                </Stack>
            </Box>
        </Popover>
    )
}

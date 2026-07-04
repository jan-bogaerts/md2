import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    MenuItem,
    Stack,
    TextField,
    ThemeProvider,
    Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { createAppTheme } from '../../theme/app_theme'
import {
    COLOR_ROLES,
    MARKDOWN_STYLE_PRESETS,
    MARKDOWN_STYLE_PRESET_NAMES,
    type ColorRole,
    type ColorSchemeConfig,
    type MarkdownStylePresetName,
} from '../../theme/theme_config'
import { useAppTheme } from '../../theme/use_app_theme'

interface ThemeSettingsDialogProps {
    open: boolean
    onClose: () => void
}

const COLOR_VARIANT_KEYS = ['light', 'regular', 'dark'] as const

function roleLabel(role: ColorRole): string {
    return role.charAt(0).toUpperCase() + role.slice(1)
}

/** Settings dialog: edit the color scheme with a live preview and pick a markdown style preset. */
export function ThemeSettingsDialog(props: ThemeSettingsDialogProps) {
    const { open, onClose } = props
    const { mode, colorScheme, markdownStyle, setColorScheme, setMarkdownStyle } = useAppTheme()
    const [draftScheme, setDraftScheme] = useState<ColorSchemeConfig>(colorScheme)

    const previewTheme = useMemo(() => createAppTheme(mode, draftScheme), [mode, draftScheme])
    const markdownPreview = MARKDOWN_STYLE_PRESETS[markdownStyle]

    const handleColorChange = (role: ColorRole, variant: (typeof COLOR_VARIANT_KEYS)[number], value: string) => {
        setDraftScheme((current) => ({
            ...current,
            [role]: { ...current[role], [variant]: value },
        }))
    }

    const handleMarkdownStyleChange = (event: { target: { value: string } }) => {
        setMarkdownStyle(event.target.value as MarkdownStylePresetName)
    }

    const handleApply = () => {
        setColorScheme(draftScheme)
        onClose()
    }

    return (
        <Dialog fullWidth maxWidth="sm" onClose={onClose} open={open}>
            <DialogTitle>Theme settings</DialogTitle>
            <DialogContent dividers>
                <Typography gutterBottom variant="subtitle1">
                    Color scheme
                </Typography>
                <Stack spacing={2}>
                    {COLOR_ROLES.map((role) => (
                        <Box key={role}>
                            <Typography variant="subtitle2">{roleLabel(role)}</Typography>
                            <Stack direction="row" spacing={2}>
                                {COLOR_VARIANT_KEYS.map((variant) => (
                                    <TextField
                                        key={variant}
                                        label={variant}
                                        onChange={(event) => handleColorChange(role, variant, event.target.value)}
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        type="color"
                                        value={draftScheme[role][variant]}
                                    />
                                ))}
                            </Stack>
                        </Box>
                    ))}
                </Stack>

                <Box sx={{ mt: 3 }}>
                    <Typography gutterBottom variant="subtitle1">
                        Preview
                    </Typography>
                    <ThemeProvider theme={previewTheme}>
                        <Stack aria-label="Color scheme preview" direction="row" spacing={2}>
                            <Button color="primary" variant="contained">
                                Primary
                            </Button>
                            <Button color="secondary" variant="contained">
                                Secondary
                            </Button>
                            <Button color="primary" variant="outlined">
                                Outlined
                            </Button>
                        </Stack>
                    </ThemeProvider>
                </Box>

                <Box sx={{ mt: 3 }}>
                    <Typography gutterBottom variant="subtitle1">
                        Markdown style
                    </Typography>
                    <TextField
                        fullWidth
                        label="Preset"
                        onChange={handleMarkdownStyleChange}
                        select
                        value={markdownStyle}
                    >
                        {MARKDOWN_STYLE_PRESET_NAMES.map((name) => (
                            <MenuItem key={name} value={name}>
                                {name}
                            </MenuItem>
                        ))}
                    </TextField>
                    <Box sx={{ mt: 2 }}>
                        <Typography sx={{ fontFamily: markdownPreview.title1.fontFamily, fontSize: markdownPreview.title1.fontSize }}>
                            Sample heading
                        </Typography>
                        <Typography sx={{ fontFamily: markdownPreview.body.fontFamily, fontSize: markdownPreview.body.fontSize }}>
                            The quick brown fox jumps over the lazy dog.
                        </Typography>
                    </Box>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleApply} variant="contained">
                    Apply
                </Button>
            </DialogActions>
        </Dialog>
    )
}

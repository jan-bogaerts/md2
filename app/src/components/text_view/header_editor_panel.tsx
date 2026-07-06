import { Box, Collapse, IconButton, Stack, TextField, Typography } from '@mui/material'
import ChevronDown from 'mdi-material-ui/ChevronDown'
import ChevronRight from 'mdi-material-ui/ChevronRight'
import { useState } from 'react'

export type HeaderFieldValue = string | string[] | Record<string, string>

interface HeaderEditorPanelProps {
    fields: Record<string, HeaderFieldValue>
    onFieldChange: (key: string, value: string) => void
    title: string
}

interface HeaderFieldRowProps {
    fieldKey: string
    onFieldChange: (key: string, value: string) => void
    value: HeaderFieldValue
}

function formatReadOnlyValue(value: string[] | Record<string, string>) {
    if (Array.isArray(value)) return value.join(', ')

    return Object.entries(value).map(([key, entry]) => `${key}: ${entry}`).join(', ')
}

/** One header field: editable text for scalar values, read-only summary for lists and maps. */
function HeaderFieldRow(props: HeaderFieldRowProps) {
    const { fieldKey, onFieldChange, value } = props
    const [draft, setDraft] = useState(typeof value === 'string' ? value : '')

    const commit = () => {
        if (typeof value === 'string' && draft !== value) onFieldChange(fieldKey, draft)
    }

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter') commit()
    }

    return (
        <>
            <Typography sx={{ alignSelf: 'center' }} variant="body2">
                {fieldKey}
            </Typography>
            {typeof value === 'string' ? (
                <TextField
                    slotProps={{ htmlInput: { 'aria-label': `Header field ${fieldKey}` } }}
                    onBlur={commit}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    size="small"
                    value={draft}
                />
            ) : (
                <Typography color="text.secondary" sx={{ alignSelf: 'center' }} variant="body2">
                    {formatReadOnlyValue(value)}
                </Typography>
            )}
        </>
    )
}

/** Collapsible frontmatter editor: collapsed shows only the title, expanded shows a key/value grid. */
export function HeaderEditorPanel(props: HeaderEditorPanelProps) {
    const { fields, onFieldChange, title } = props
    const [isExpanded, setIsExpanded] = useState(false)

    return (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 2 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1, py: 0.5 }}>
                <IconButton
                    aria-expanded={isExpanded}
                    aria-label="Toggle header fields"
                    onClick={() => setIsExpanded((current) => !current)}
                    size="small"
                >
                    {isExpanded ? <ChevronDown /> : <ChevronRight />}
                </IconButton>
                <Typography variant="subtitle2">{title}</Typography>
            </Stack>
            <Collapse in={isExpanded} unmountOnExit>
                <Box
                    aria-label="Header fields"
                    sx={{ columnGap: 2, display: 'grid', gridTemplateColumns: 'auto 1fr', p: 1, pt: 0, rowGap: 1 }}
                >
                    {Object.entries(fields).map(([key, value]) => (
                        <HeaderFieldRow fieldKey={key} key={key} onFieldChange={onFieldChange} value={value} />
                    ))}
                </Box>
            </Collapse>
        </Box>
    )
}

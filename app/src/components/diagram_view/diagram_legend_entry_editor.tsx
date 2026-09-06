import ArrowDownwardOutlined from '@mui/icons-material/ArrowDownwardOutlined'
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import { Box, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { useState, type ChangeEvent, type KeyboardEvent } from 'react'
import type { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { useEditableDiagramLegendEntryLabel } from './use_editable_diagram'

interface DiagramLegendEntryEditorProps {
    entryCount: number
    entryIndex: number
    entryKey: string
    onValidationMessage: (message: string | null) => void
    session: DiagramEditSessionService
}

function semanticLabel(entryKey: string) {
    const [entryType, semantic] = entryKey.split(':')

    return entryType === 'node' ? `${semantic} node` : `${semantic} connection`
}

/** Edits one legend entry, subscribing only to that entry's own label. */
export function DiagramLegendEntryEditor({
    entryCount,
    entryIndex,
    entryKey,
    onValidationMessage,
    session,
}: DiagramLegendEntryEditorProps) {
    const label = useEditableDiagramLegendEntryLabel(entryKey, session) ?? ''
    const [draftLabel, setDraftLabel] = useState(label)
    const commitLabel = () => {
        if (draftLabel.trim() === label) {
            setDraftLabel(label)

            return
        }
        if (session.setLegendEntryLabel(entryKey, draftLabel)) onValidationMessage(null)
        else {
            onValidationMessage(`Label for ${semanticLabel(entryKey)} is required.`)
            setDraftLabel(label)
        }
    }
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => setDraftLabel(event.target.value)
    const handleBlur = () => commitLabel()
    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault()
            commitLabel()
        }
        if (event.key === 'Escape') setDraftLabel(label)
    }

    return (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Box sx={{ flex: 1 }}>
                <Typography color="text.secondary" variant="caption">{semanticLabel(entryKey)}</Typography>
                <TextField
                    fullWidth
                    onBlur={handleBlur}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    size="small"
                    slotProps={{ htmlInput: { 'aria-label': `Label for ${semanticLabel(entryKey)}` } }}
                    value={draftLabel}
                />
            </Box>
            <Tooltip title="Move entry up">
                <span>
                    <IconButton
                        aria-label={`Move ${semanticLabel(entryKey)} up`}
                        disabled={entryIndex === 0}
                        onClick={() => session.moveLegendEntry(entryKey, entryIndex - 1)}
                        size="small"
                    >
                        <ArrowUpwardOutlined fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
            <Tooltip title="Move entry down">
                <span>
                    <IconButton
                        aria-label={`Move ${semanticLabel(entryKey)} down`}
                        disabled={entryIndex === entryCount - 1}
                        onClick={() => session.moveLegendEntry(entryKey, entryIndex + 1)}
                        size="small"
                    >
                        <ArrowDownwardOutlined fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
            <Tooltip title="Remove entry">
                <IconButton
                    aria-label={`Remove ${semanticLabel(entryKey)}`}
                    onClick={() => session.removeLegendEntry(entryKey)}
                    size="small"
                >
                    <DeleteOutlineOutlined fontSize="small" />
                </IconButton>
            </Tooltip>
        </Stack>
    )
}

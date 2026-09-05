import { Alert, Button, DialogActions, DialogContent, Stack, TextField, Typography } from '@mui/material'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'

interface DiagramMetadataDraft {
    description: string
    title: string
}

interface DiagramMetadataDetailsEditorProps {
    onClose: () => void
    session: DiagramEditSessionService
}

function initialDraft(session: DiagramEditSessionService): DiagramMetadataDraft {
    return {
        description: session.getMetadataFieldSnapshot('description') ?? '',
        title: session.getMetadataFieldSnapshot('title') ?? '',
    }
}

/** Edits mutable diagram metadata while presenting immutable schema context as read-only fields. */
export function DiagramMetadataDetailsEditor({ onClose, session }: DiagramMetadataDetailsEditorProps) {
    const [draft, setDraft] = useState(() => initialDraft(session))
    const [validationError, setValidationError] = useState<string | null>(null)
    const diagramType = session.getMetadataFieldSnapshot('type')
    const flowPreset = session.getMetadataFieldSnapshot('preset')
    const schemaVersion = session.getMetadataFieldSnapshot('version')
    const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target
        setDraft((current) => ({ ...current, [name]: value }))
    }
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const title = draft.title.trim()
        const description = draft.description.trim()
        if (title.length === 0) {
            setValidationError('Title is required.')

            return
        }
        if (description.length === 0) {
            setValidationError('Description is required.')

            return
        }

        let saved = true
        if (session.getMetadataFieldSnapshot('title') !== title) {
            saved = session.setMetadataField('title', title) && saved
        }
        if (session.getMetadataFieldSnapshot('description') !== description) {
            saved = session.setMetadataField('description', description) && saved
        }
        if (saved) onClose()
    }

    return (
        <form onSubmit={handleSubmit}>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ pt: 0.5 }}>
                    {validationError ? <Alert severity="error">{validationError}</Alert> : null}
                    <Stack spacing={0.9}>
                        <Typography color="text.secondary" variant="body2">Title</Typography>
                        <TextField
                            autoFocus
                            name="title"
                            onChange={handleFieldChange}
                            required
                            size="small"
                            slotProps={{ htmlInput: { 'aria-label': 'Title' } }}
                            value={draft.title}
                        />
                    </Stack>
                    <Stack spacing={0.9}>
                        <Typography color="text.secondary" variant="body2">Description</Typography>
                        <TextField
                            multiline
                            name="description"
                            onChange={handleFieldChange}
                            required
                            rows={3}
                            size="small"
                            slotProps={{ htmlInput: { 'aria-label': 'Description' } }}
                            value={draft.description}
                        />
                    </Stack>
                    <Stack spacing={0.9}>
                        <Typography color="text.secondary" variant="body2">Type</Typography>
                        <TextField
                            size="small"
                            slotProps={{ htmlInput: { 'aria-label': 'Type', readOnly: true } }}
                            value={diagramType ?? ''}
                        />
                    </Stack>
                    <Stack spacing={0.9}>
                        <Typography color="text.secondary" variant="body2">Schema version</Typography>
                        <TextField
                            size="small"
                            slotProps={{ htmlInput: { 'aria-label': 'Schema version', readOnly: true } }}
                            value={schemaVersion ?? ''}
                        />
                    </Stack>
                    {diagramType === 'flow' ? (
                        <Stack spacing={0.9}>
                            <Typography color="text.secondary" variant="body2">Flow preset</Typography>
                            <TextField
                                size="small"
                                slotProps={{ htmlInput: { 'aria-label': 'Flow preset', readOnly: true } }}
                                value={flowPreset ?? ''}
                            />
                        </Stack>
                    ) : null}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} variant="outlined">Cancel</Button>
                <Button type="submit" variant="contained">Save</Button>
            </DialogActions>
        </form>
    )
}

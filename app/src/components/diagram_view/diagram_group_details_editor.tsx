import { Alert, Button, DialogActions, DialogContent, Stack, TextField } from '@mui/material'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'

interface DiagramGroupDetailsEditorProps {
    groupId: string
    onClose: () => void
    session: DiagramEditSessionService
}

export function DiagramGroupDetailsEditor({ groupId, onClose, session }: DiagramGroupDetailsEditorProps) {
    const [label, setLabel] = useState(() => session.getGroupFieldSnapshot(groupId, 'label') ?? '')
    const [validationError, setValidationError] = useState<string | null>(null)
    const handleLabelChange = (event: ChangeEvent<HTMLInputElement>) => setLabel(event.target.value)
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (label.trim().length === 0) {
            setValidationError('Label is required.')
            return
        }

        const currentLabel = session.getGroupFieldSnapshot(groupId, 'label')
        if (currentLabel === null) return
        if (currentLabel === label || session.setGroupField(groupId, 'label', label)) onClose()
    }

    return (
        <form onSubmit={handleSubmit}>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ pt: 0.5 }}>
                    {validationError ? <Alert severity="error">{validationError}</Alert> : null}
                    <TextField autoFocus label="Label" onChange={handleLabelChange} required size="small" value={label} />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button type="submit" variant="contained">Save</Button>
            </DialogActions>
        </form>
    )
}

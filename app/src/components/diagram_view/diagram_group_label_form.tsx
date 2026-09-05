import { Alert, Button, DialogActions, DialogContent, Stack, TextField, Typography } from '@mui/material'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { DiagramGroupDrawingService } from '../../services/diagrams/diagram_group_drawing_service'

interface DiagramGroupLabelFormProps {
    drawing: Pick<DiagramGroupDrawingService, 'completeGroup'>
    onCancel: () => void
}

/** Required-label form mounted only while one completed rectangle awaits creation. */
export function DiagramGroupLabelForm({ drawing, onCancel }: DiagramGroupLabelFormProps) {
    const [label, setLabel] = useState('')
    const [validationError, setValidationError] = useState<string | null>(null)
    const handleLabelChange = (event: ChangeEvent<HTMLInputElement>) => setLabel(event.target.value)
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (label.trim().length === 0) {
            setValidationError('Label is required.')

            return
        }

        drawing.completeGroup(label)
    }

    return (
        <form onSubmit={handleSubmit}>
            <DialogContent dividers>
                <Stack spacing={1} sx={{ pt: 0.5 }}>
                    {validationError ? <Alert severity="error">{validationError}</Alert> : null}
                    <Typography color="text.secondary" variant="body2">Label</Typography>
                    <TextField
                        autoFocus
                        onChange={handleLabelChange}
                        required
                        size="small"
                        slotProps={{ htmlInput: { 'aria-label': 'Label' } }}
                        value={label}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel} variant="outlined">Cancel</Button>
                <Button type="submit" variant="contained">Save</Button>
            </DialogActions>
        </form>
    )
}

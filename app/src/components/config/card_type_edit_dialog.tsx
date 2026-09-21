import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
} from '@mui/material'
import type { ChangeEvent } from 'react'
import type { CardTypeConfig } from '../../data/data_types'

const CARD_TYPE_RENAME_WARNING = 'Cards already using the old value keep it, and lose their colour and ID prefix until it is set back.'
const COLOR_INPUT_SLOT_PROPS = { inputLabel: { shrink: true } }

interface CardTypeEditDialogProps {
    disabled: boolean
    draft: CardTypeConfig
    errors: string[]
    existing: boolean
    onCancel: () => void
    onDelete: () => void
    onFieldChange: (event: ChangeEvent<HTMLInputElement>) => void
    onSave: () => void
    removable: boolean
}

/** Popup that edits one card type as a local draft, so cancelling discards every field at once. */
export function CardTypeEditDialog(props: CardTypeEditDialogProps) {
    const { disabled, draft, errors, existing, onCancel, onDelete, onFieldChange, onSave, removable } = props
    const titleId = 'card-type-edit-dialog-title'

    return (
        <Dialog aria-labelledby={titleId} fullWidth maxWidth="xs" onClose={onCancel} open>
            <DialogTitle id={titleId}>{existing ? 'Edit card type' : 'Add card type'}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {errors.length > 0 ? <Alert severity="error">{errors.join(' ')}</Alert> : null}
                    <TextField disabled={disabled} fullWidth label="Label" name="label" onChange={onFieldChange} size="small" value={draft.label} />
                    <Stack spacing={0.5}>
                        <TextField disabled={disabled} fullWidth label="Type" name="type" onChange={onFieldChange} size="small" value={draft.type} />
                        {existing ? (
                            <Typography color="warning.main" variant="caption">{CARD_TYPE_RENAME_WARNING}</Typography>
                        ) : null}
                    </Stack>
                    <TextField disabled={disabled} fullWidth label="ID prefix" name="idPrefix" onChange={onFieldChange} size="small" value={draft.idPrefix} />
                    <TextField
                        disabled={disabled}
                        fullWidth
                        label="Color"
                        name="color"
                        onChange={onFieldChange}
                        size="small"
                        slotProps={COLOR_INPUT_SLOT_PROPS}
                        type="color"
                        value={draft.color}
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                {existing ? (
                    <Button color="error" disabled={disabled || !removable} onClick={onDelete} variant="outlined">
                        Delete
                    </Button>
                ) : null}
                <Button onClick={onCancel} variant="outlined">Cancel</Button>
                <Button disabled={disabled || errors.length > 0} onClick={onSave} variant="contained">Save</Button>
            </DialogActions>
        </Dialog>
    )
}

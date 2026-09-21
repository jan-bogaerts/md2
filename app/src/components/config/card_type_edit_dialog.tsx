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
import { ColorPickerField } from '../color_picker_field'

const CARD_TYPE_RENAME_WARNING = 'Renaming the label changes the type actions match on. Cards already using the old value keep it, and lose their colour and ID prefix until the label is set back.'
const CARD_TYPE_ID_HELPER = 'Derived from the label. Actions match on this value.'

interface CardTypeEditDialogProps {
    disabled: boolean
    draft: CardTypeConfig
    errors: string[]
    existing: boolean
    onCancel: () => void
    onColorChange: (value: string) => void
    onDelete: () => void
    onFieldChange: (event: ChangeEvent<HTMLInputElement>) => void
    onSave: () => void
    removable: boolean
    renamed: boolean
}

/** Popup that edits one card type as a local draft, so cancelling discards every field at once. */
export function CardTypeEditDialog(props: CardTypeEditDialogProps) {
    const { disabled, draft, errors, existing, onCancel, onColorChange, onDelete, onFieldChange, onSave, removable, renamed } = props
    const titleId = 'card-type-edit-dialog-title'

    return (
        <Dialog aria-labelledby={titleId} fullWidth maxWidth="xs" onClose={onCancel} open>
            <DialogTitle id={titleId}>{existing ? 'Edit card type' : 'Add card type'}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {errors.length > 0 ? <Alert severity="error">{errors.join(' ')}</Alert> : null}
                    <TextField disabled={disabled} fullWidth label="Label" name="label" onChange={onFieldChange} size="small" value={draft.label} />
                    <Stack spacing={0.5}>
                        <TextField disabled fullWidth helperText={CARD_TYPE_ID_HELPER} label="Type" name="type" size="small" value={draft.type} />
                        {renamed ? (
                            <Typography color="warning.main" variant="caption">{CARD_TYPE_RENAME_WARNING}</Typography>
                        ) : null}
                    </Stack>
                    <Stack direction="row" spacing={2} sx={{ '& > *': { flex: 1, minWidth: 0 } }}>
                        <TextField disabled={disabled} fullWidth label="ID prefix" name="idPrefix" onChange={onFieldChange} size="small" value={draft.idPrefix} />
                        <ColorPickerField disabled={disabled} label="Color" onChange={onColorChange} value={draft.color} />
                    </Stack>
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

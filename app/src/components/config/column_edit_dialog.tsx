import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Stack,
    Switch,
    TextField,
} from '@mui/material'
import type { ChangeEvent } from 'react'
import { ColorPickerField } from '../color_picker_field'
import { useActions } from '../hooks/use_actions'

export const NO_DEFAULT_ACTION_VALUE = ''

export interface ColumnDraft {
    alwaysVisible: boolean
    color: string
    defaultActionId: string
    state: string
}

interface ColumnEditDialogProps {
    canMoveLeft: boolean
    canMoveRight: boolean
    disabled: boolean
    draft: ColumnDraft
    errors: string[]
    existing: boolean
    onAlwaysVisibleChange: (event: ChangeEvent<HTMLInputElement>) => void
    onCancel: () => void
    onColorChange: (value: string) => void
    onDelete: () => void
    onFieldChange: (event: ChangeEvent<HTMLInputElement>) => void
    onMoveLeft: () => void
    onMoveRight: () => void
    onSave: () => void
    removable: boolean
}

/** Popup that edits one board column as a local draft, so cancelling discards every field at once. */
export function ColumnEditDialog(props: ColumnEditDialogProps) {
    const {
        canMoveLeft,
        canMoveRight,
        disabled,
        draft,
        errors,
        existing,
        onAlwaysVisibleChange,
        onCancel,
        onColorChange,
        onDelete,
        onFieldChange,
        onMoveLeft,
        onMoveRight,
        onSave,
        removable,
    } = props
    const { actions } = useActions()
    const titleId = 'column-edit-dialog-title'

    return (
        <Dialog aria-labelledby={titleId} fullWidth maxWidth="xs" onClose={onCancel} open>
            <DialogTitle id={titleId}>{existing ? 'Edit column' : 'Add column'}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {errors.length > 0 ? <Alert severity="error">{errors.join(' ')}</Alert> : null}
                    <TextField disabled={disabled} fullWidth label="Name" name="state" onChange={onFieldChange} size="small" value={draft.state} />
                    <Stack direction="row" spacing={2} sx={{ '& > *': { flex: 1, minWidth: 0 } }}>
                        <ColorPickerField disabled={disabled} label="Color" onChange={onColorChange} value={draft.color} />
                        <FormControlLabel
                            control={<Switch checked={draft.alwaysVisible} disabled={disabled} onChange={onAlwaysVisibleChange} />}
                            label="Always visible"
                        />
                    </Stack>
                    <TextField
                        disabled={disabled}
                        fullWidth
                        label="Default action"
                        name="defaultActionId"
                        onChange={onFieldChange}
                        select
                        size="small"
                        value={draft.defaultActionId}
                    >
                        <MenuItem value={NO_DEFAULT_ACTION_VALUE}>None</MenuItem>
                        {actions.map((action) => <MenuItem key={action.id} value={action.id}>{action.label}</MenuItem>)}
                    </TextField>
                </Stack>
            </DialogContent>
            <DialogActions>
                {existing ? (
                    <>
                        <Button disabled={disabled || !canMoveLeft} onClick={onMoveLeft} variant="outlined">Move left</Button>
                        <Button disabled={disabled || !canMoveRight} onClick={onMoveRight} variant="outlined">Move right</Button>
                        <Button color="error" disabled={disabled || !removable} onClick={onDelete} variant="outlined">Delete</Button>
                    </>
                ) : null}
                <Button onClick={onCancel} variant="outlined">Cancel</Button>
                <Button disabled={disabled || errors.length > 0} onClick={onSave} variant="contained">Save</Button>
            </DialogActions>
        </Dialog>
    )
}

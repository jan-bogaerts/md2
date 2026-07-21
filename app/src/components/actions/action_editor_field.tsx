import { Stack, TextField, Typography } from '@mui/material'
import type { TextFieldProps } from '@mui/material'

export interface ActionEditorFieldProps extends Omit<TextFieldProps, 'id' | 'label' | 'slotProps'> {
    fieldId: string
    label: string
}

/** Action-editor field with a persistent label and linked helper text. */
export function ActionEditorField(props: ActionEditorFieldProps) {
    const { fieldId, helperText, label, ...textFieldProps } = props
    const labelId = `${fieldId}-label`
    const helperTextId = `${fieldId}-helper-text`
    const describedBy = helperText === undefined || helperText === null ? undefined : helperTextId
    const accessibilityProps = { 'aria-describedby': describedBy, 'aria-labelledby': labelId }
    const inputSlotProps = textFieldProps.select
        ? { select: { inputProps: { 'aria-describedby': describedBy }, labelId } }
        : { htmlInput: accessibilityProps }

    return (
        <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
            <Typography color="text.secondary" component="label" htmlFor={fieldId} id={labelId} sx={{ fontWeight: 600 }} variant="caption">
                {label}
            </Typography>
            <TextField
                {...textFieldProps}
                helperText={helperText}
                id={fieldId}
                slotProps={{
                    formHelperText: { id: helperTextId },
                    ...inputSlotProps,
                }}
                sx={{ minWidth: 0 }}
            />
        </Stack>
    )
}

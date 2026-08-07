import { useState, type ChangeEvent } from 'react'
import { ActionEditorField, type ActionEditorFieldProps } from './action_editor_field'

interface ActionEditorTextFieldProps extends Omit<ActionEditorFieldProps, 'onChange' | 'select' | 'value'> {
    onChange: (event: ChangeEvent<HTMLInputElement>) => void
    source: object
    value: string
}

/** Keep keystroke rendering local while staging each value in the action draft service. */
export function ActionEditorTextField(props: ActionEditorTextFieldProps) {
    const { onChange, source, value, ...fieldProps } = props
    const [valueDraft, setValueDraft] = useState({ baseline: source, value })
    const draftValue = valueDraft.baseline === source ? valueDraft.value : value

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setValueDraft({ baseline: source, value: event.target.value })
        onChange(event)
    }

    return <ActionEditorField {...fieldProps} onChange={handleChange} value={draftValue} />
}

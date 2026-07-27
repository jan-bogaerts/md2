import AddOutlined from '@mui/icons-material/AddOutlined'
import { Button } from '@mui/material'
import type { ChangeEvent } from 'react'
import type { ActionDefinition, RawOnRule } from '../../data/action_types'
import { dialogService } from '../../services/dialog_service'
import { ActionOrderedCollection } from './action_ordered_collection'
import { ActionSelectorField } from './action_selector_field'
import { ActionEditorTextField } from './action_editor_text_field'

interface ActionOnRulesEditorProps {
    actions: ActionDefinition[]
    error?: string
    errorIndex?: number | null
    onChange: (rules: RawOnRule[] | undefined) => void
    value: RawOnRule[] | undefined
}

export function ActionOnRulesEditor(props: ActionOnRulesEditorProps) {
    const { actions, error, errorIndex, onChange, value = [] } = props

    const handleAdd = () => {
        const action = actions[0]
        if (action) onChange([...value, { actionId: action.id, condition: '' }])
    }

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        try {
            const [field, rawIndex] = event.target.name.split(':')
            const index = Number.parseInt(rawIndex, 10)
            const rule = value[index]
            if (!rule) throw new Error(`Missing on rule at index ${index}`)
            onChange(value.map((candidate, ruleIndex) => ruleIndex === index ? { ...candidate, [field]: event.target.value } : candidate))
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Output rule could not be changed' })
        }
    }

    const handleCollectionChange = (next: RawOnRule[]) => onChange(next.length > 0 ? next : undefined)
    const renderFields = (rule: RawOnRule, index: number, indexedError: string | undefined) => (
        <>
            <ActionEditorTextField
                error={!!indexedError}
                fieldId={`action-output-condition-${index}`}
                helperText={indexedError}
                label="Regular expression"
                name={`condition:${index}`}
                onChange={handleChange}
                size="small"
                source={rule}
                value={rule.condition}
            />
            <ActionSelectorField
                actions={actions}
                fieldId={`action-output-action-${index}`}
                name={`actionId:${index}`}
                onChange={handleChange}
                value={rule.actionId}
            />
        </>
    )
    const rowLabel = (index: number) => `Output rule ${index + 1}`
    const addControl = (
        <Button disabled={actions.length === 0} onClick={handleAdd} size="small" startIcon={<AddOutlined />} sx={{ alignSelf: 'flex-start' }} variant="outlined">
            Add output rule
        </Button>
    )

    return (
        <ActionOrderedCollection
            addControl={addControl}
            controlLabel="output rule"
            emptyText="No output rules. Output does not trigger follow-up actions."
            error={error}
            errorIndex={errorIndex}
            gridTemplateColumns={{ sm: 'minmax(0, 1fr) minmax(0, 1fr) auto', xs: 'minmax(0, 1fr)' }}
            items={value}
            label="Output rules"
            onChange={handleCollectionChange}
            renderFields={renderFields}
            rowLabel={rowLabel}
        />
    )
}

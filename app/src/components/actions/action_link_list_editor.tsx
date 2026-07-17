import AddOutlined from '@mui/icons-material/AddOutlined'
import { Button } from '@mui/material'
import type { ChangeEvent } from 'react'
import type { ActionDefinition } from '../../data/action_types'
import { ActionOrderedCollection } from './action_ordered_collection'
import { ActionSelectorField } from './action_selector_field'

interface ActionLinkListEditorProps {
    actions: ActionDefinition[]
    emptyText?: string
    error?: string
    errorIndex?: number | null
    label: string
    onChange: (actionIds: string[] | undefined) => void
    value: string[] | undefined
}

export function ActionLinkListEditor(props: ActionLinkListEditorProps) {
    const { actions, emptyText, error, errorIndex, label, onChange, value = [] } = props

    const handleAdd = () => {
        const action = actions.find(({ id }) => !value.includes(id))
        if (action) onChange([...value, action.id])
    }

    const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
        const index = Number.parseInt(event.target.name, 10)
        onChange(value.map((actionId, actionIndex) => actionIndex === index ? event.target.value : actionId))
    }

    const handleCollectionChange = (next: string[]) => onChange(next.length > 0 ? next : undefined)
    const renderFields = (actionId: string, index: number, indexedError: string | undefined) => (
        <ActionSelectorField
            actions={actions}
            error={indexedError}
            fieldId={`action-${label.toLowerCase()}-${index}`}
            name={String(index)}
            onChange={handleSelect}
            value={actionId}
        />
    )
    const rowLabel = (index: number) => `${label} action ${index + 1}`
    const addControl = (
        <Button disabled={!actions.some(({ id }) => !value.includes(id))} onClick={handleAdd} size="small" startIcon={<AddOutlined />} sx={{ alignSelf: 'flex-start' }} variant="outlined">
            Add action
        </Button>
    )

    return (
        <ActionOrderedCollection
            addControl={addControl}
            controlLabel={`${label} action`}
            emptyText={emptyText}
            error={error}
            errorIndex={errorIndex}
            gridTemplateColumns={{ sm: 'minmax(0, 1fr) auto', xs: 'minmax(0, 1fr)' }}
            items={value}
            label={label}
            onChange={handleCollectionChange}
            renderFields={renderFields}
            rowLabel={rowLabel}
        />
    )
}

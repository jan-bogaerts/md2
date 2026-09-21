import { Button, Stack } from '@mui/material'
import Plus from 'mdi-material-ui/Plus'
import type { ChangeEvent } from 'react'
import { useEffect, useState } from 'react'
import type { CardTypeConfig } from '../../data/data_types'
import { DEFAULT_CARD_TYPES } from '../../data/data_types'
import { CardTypeButton } from './card_type_button'
import { cardTypeIdFromLabel } from './card_type_id'
import { CardTypeEditDialog } from './card_type_edit_dialog'

const NEW_CARD_TYPE_COLOR = DEFAULT_CARD_TYPES[0]!.color
const RESERVED_CARD_TYPES = ['root', 'child']

interface CardTypesEditorProps {
    disabled?: boolean
    onChange: (value: CardTypeConfig[]) => void
    onValidityChange?: (valid: boolean) => void
    value: CardTypeConfig[]
}

interface CardTypeEditState {
    draft: CardTypeConfig
    index: number | null
    storedType: string
}

function newCardType(): CardTypeConfig {
    return { color: NEW_CARD_TYPE_COLOR, idPrefix: '', label: '', type: '' }
}

function draftErrors(draft: CardTypeConfig, otherCardTypes: CardTypeConfig[]) {
    const errors: string[] = []
    const label = draft.label.trim()
    const type = draft.type.trim()
    const idPrefix = draft.idPrefix.trim()

    if (label.length === 0) errors.push('Label is required.')
    if (idPrefix.length === 0) errors.push('ID prefix is required.')
    if (RESERVED_CARD_TYPES.includes(type)) errors.push(`Reserved card type: ${type}`)
    if (draft.color.length === 0) errors.push('Color is required.')
    if (type.length > 0 && otherCardTypes.some((cardType) => cardType.type === type)) {
        errors.push(`Duplicate card type: ${type}`)
    }
    if (idPrefix.length > 0 && otherCardTypes.some((cardType) => cardType.idPrefix === idPrefix)) {
        errors.push(`Duplicate ID prefix: ${idPrefix}`)
    }

    return errors
}

function storedValueValid(value: CardTypeConfig[]) {
    if (value.length === 0) return false
    const types = value.map((cardType) => cardType.type)
    const idPrefixes = value.map((cardType) => cardType.idPrefix)
    const fieldsFilled = value.every((cardType) => cardType.label.trim().length > 0
        && cardType.type.trim().length > 0
        && cardType.idPrefix.trim().length > 0
        && cardType.color.length > 0)

    return fieldsFilled && new Set(types).size === types.length && new Set(idPrefixes).size === idPrefixes.length
}

/** Card types edited as coloured buttons with a per-type popup, replacing the raw JSON field. */
export function CardTypesEditor(props: CardTypesEditorProps) {
    const { disabled = false, onChange, onValidityChange, value } = props
    const [editState, setEditState] = useState<CardTypeEditState | null>(null)
    const otherCardTypes = editState
        ? value.filter((_cardType, index) => index !== editState.index)
        : []
    const errors = editState ? draftErrors(editState.draft, otherCardTypes) : []
    const valid = storedValueValid(value)

    useEffect(() => {
        onValidityChange?.(valid)
    }, [onValidityChange, valid])

    const startAdd = () => {
        setEditState({ draft: newCardType(), index: null, storedType: '' })
    }

    const startEdit = (index: number) => {
        const cardType = value[index]
        if (!cardType) return

        setEditState({ draft: { ...cardType }, index, storedType: cardType.type })
    }

    const cancelEdit = () => {
        setEditState(null)
    }

    const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
        const field = event.target.name as 'idPrefix' | 'label'
        const nextValue = event.target.value
        setEditState((currentState) => {
            if (!currentState) return currentState
            const draft = { ...currentState.draft, [field]: nextValue }

            return { ...currentState, draft: field === 'label' ? { ...draft, type: cardTypeIdFromLabel(nextValue) } : draft }
        })
    }

    const handleColorChange = (color: string) => {
        setEditState((currentState) => (currentState
            ? { ...currentState, draft: { ...currentState.draft, color } }
            : currentState))
    }

    const saveCardType = () => {
        if (!editState || errors.length > 0) return

        const { draft, index } = editState
        const savedCardType: CardTypeConfig = {
            color: draft.color,
            idPrefix: draft.idPrefix.trim(),
            label: draft.label.trim(),
            type: draft.type.trim(),
        }
        onChange(index === null
            ? [...value, savedCardType]
            : value.map((cardType, cardIndex) => (cardIndex === index ? savedCardType : cardType)))
        setEditState(null)
    }

    const deleteCardType = () => {
        if (!editState || editState.index === null || value.length <= 1) return

        const removedIndex = editState.index
        onChange(value.filter((_cardType, index) => index !== removedIndex))
        setEditState(null)
    }

    return (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {value.map((cardType, index) => (
                <CardTypeButton
                    cardType={cardType}
                    disabled={disabled}
                    index={index}
                    key={`${cardType.type}-${index}`}
                    onEdit={startEdit}
                />
            ))}
            <Button disabled={disabled} onClick={startAdd} startIcon={<Plus />} variant="outlined">
                Add card type
            </Button>
            {editState ? (
                <CardTypeEditDialog
                    disabled={disabled}
                    draft={editState.draft}
                    errors={errors}
                    existing={editState.index !== null}
                    onCancel={cancelEdit}
                    onColorChange={handleColorChange}
                    onDelete={deleteCardType}
                    onFieldChange={handleFieldChange}
                    onSave={saveCardType}
                    removable={value.length > 1}
                    renamed={editState.index !== null && editState.draft.type !== editState.storedType}
                />
            ) : null}
        </Stack>
    )
}

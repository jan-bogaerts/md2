import { Button, Stack } from '@mui/material'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import Plus from 'mdi-material-ui/Plus'
import type { ChangeEvent } from 'react'
import { useEffect, useState } from 'react'
import type { StateConfig } from '../../data/data_types'
import { defaultColumnAccent } from '../../data/data_types'
import { ColumnButton } from './column_button'
import { reorderColumns } from './column_reorder'
import { ColumnEditDialog, NO_DEFAULT_ACTION_VALUE, type ColumnDraft } from './column_edit_dialog'

const DRAG_ACTIVATION_DISTANCE = 2

interface ColumnsEditorProps {
    disabled?: boolean
    onChange: (value: StateConfig[]) => void
    onValidityChange?: (valid: boolean) => void
    value: StateConfig[]
}

interface ColumnEditState {
    draft: ColumnDraft
    index: number | null
}

function toDraft(column: StateConfig, index: number): ColumnDraft {
    return {
        alwaysVisible: column.alwaysVisible,
        color: column.color ?? defaultColumnAccent(index),
        defaultActionId: column.defaultActionId ?? NO_DEFAULT_ACTION_VALUE,
        state: column.state,
    }
}

function toStateConfig(draft: ColumnDraft): StateConfig {
    return {
        alwaysVisible: draft.alwaysVisible,
        color: draft.color,
        ...(draft.defaultActionId === NO_DEFAULT_ACTION_VALUE ? {} : { defaultActionId: draft.defaultActionId }),
        state: draft.state.trim(),
    }
}

function draftErrors(draft: ColumnDraft, otherColumns: StateConfig[]) {
    const errors: string[] = []
    const state = draft.state.trim()

    if (state.length === 0) errors.push('Name is required.')
    if (state.length > 0 && otherColumns.some((column) => column.state === state)) {
        errors.push(`Duplicate column: ${state}`)
    }

    return errors
}

function storedValueValid(value: StateConfig[]) {
    if (value.length === 0) return false
    const states = value.map((column) => column.state)

    return states.every((state) => state.trim().length > 0) && new Set(states).size === states.length
}

/** Board columns edited as coloured, drag-sortable buttons with a per-column popup. */
export function ColumnsEditor(props: ColumnsEditorProps) {
    const { disabled = false, onChange, onValidityChange, value } = props
    const [editState, setEditState] = useState<ColumnEditState | null>(null)
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE } }))
    const otherColumns = editState ? value.filter((_column, index) => index !== editState.index) : []
    const errors = editState ? draftErrors(editState.draft, otherColumns) : []
    const valid = storedValueValid(value)

    useEffect(() => {
        onValidityChange?.(valid)
    }, [onValidityChange, valid])

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        if (!over) return

        const nextValue = reorderColumns(value, String(active.id), String(over.id))
        if (nextValue !== value) onChange(nextValue)
    }

    const startAdd = () => {
        setEditState({
            draft: { alwaysVisible: true, color: defaultColumnAccent(value.length), defaultActionId: NO_DEFAULT_ACTION_VALUE, state: '' },
            index: null,
        })
    }

    const startEdit = (index: number) => {
        const column = value[index]
        if (!column) return

        setEditState({ draft: toDraft(column, index), index })
    }

    const cancelEdit = () => {
        setEditState(null)
    }

    const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
        const field = event.target.name as 'defaultActionId' | 'state'
        const nextValue = event.target.value
        setEditState((currentState) => (currentState
            ? { ...currentState, draft: { ...currentState.draft, [field]: nextValue } }
            : currentState))
    }

    const handleColorChange = (color: string) => {
        setEditState((currentState) => (currentState
            ? { ...currentState, draft: { ...currentState.draft, color } }
            : currentState))
    }

    const handleAlwaysVisibleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.checked
        setEditState((currentState) => (currentState
            ? { ...currentState, draft: { ...currentState.draft, alwaysVisible: nextValue } }
            : currentState))
    }

    const moveColumn = (offset: number) => {
        if (!editState || editState.index === null) return
        const targetIndex = editState.index + offset
        if (targetIndex < 0 || targetIndex >= value.length) return

        onChange(arrayMove(value, editState.index, targetIndex))
        setEditState({ ...editState, index: targetIndex })
    }

    const moveColumnLeft = () => {
        moveColumn(-1)
    }

    const moveColumnRight = () => {
        moveColumn(1)
    }

    const saveColumn = () => {
        if (!editState || errors.length > 0) return

        const { draft, index } = editState
        const savedColumn = toStateConfig(draft)
        onChange(index === null
            ? [...value, savedColumn]
            : value.map((column, columnIndex) => (columnIndex === index ? savedColumn : column)))
        setEditState(null)
    }

    const deleteColumn = () => {
        if (!editState || editState.index === null || value.length <= 1) return

        const removedIndex = editState.index
        onChange(value.filter((_column, index) => index !== removedIndex))
        setEditState(null)
    }

    return (
        <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
            <SortableContext items={value.map((column) => column.state)} strategy={horizontalListSortingStrategy}>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                    {value.map((column, index) => (
                        <ColumnButton column={column} disabled={disabled} index={index} key={column.state} onEdit={startEdit} />
                    ))}
                    <Button disabled={disabled} onClick={startAdd} startIcon={<Plus />} variant="outlined">
                        Add column
                    </Button>
                </Stack>
            </SortableContext>
            {editState ? (
                <ColumnEditDialog
                    canMoveLeft={editState.index !== null && editState.index > 0}
                    canMoveRight={editState.index !== null && editState.index < value.length - 1}
                    disabled={disabled}
                    draft={editState.draft}
                    errors={errors}
                    existing={editState.index !== null}
                    onAlwaysVisibleChange={handleAlwaysVisibleChange}
                    onCancel={cancelEdit}
                    onColorChange={handleColorChange}
                    onDelete={deleteColumn}
                    onFieldChange={handleFieldChange}
                    onMoveLeft={moveColumnLeft}
                    onMoveRight={moveColumnRight}
                    onSave={saveColumn}
                    removable={value.length > 1}
                />
            ) : null}
        </DndContext>
    )
}

import { TextField } from '@mui/material'
import { useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from 'react'
import {
    DiagramEditSessionService,
} from '../../../services/diagrams/diagram_edit_session_service'
import type {
    MutableDiagramMetaField,
} from '../../../services/diagrams/diagram_edit_types'
import { useEditableDiagramMetadataField } from './use_editable_diagram'
import { diagramFontStyle } from '../formatting/diagram_font_style'
import { useDiagramFormattingScale } from '../formatting/use_diagram_formatting'

/** Edits one New diagram metadata field without opening its details dialog. */
export function DiagramInlineMetadataField({ field, session }: { field: MutableDiagramMetaField, session: DiagramEditSessionService }) {
    const value = useEditableDiagramMetadataField(field, session) ?? ''
    const fontScalePercent = useDiagramFormattingScale('fontScalePercent', session)
    const [draftState, setDraftState] = useState({ base: value, value })
    const draft = draftState.base === value ? draftState.value : value
    const [error, setError] = useState<string | null>(null)
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setDraftState({ base: value, value: event.target.value })
        setError(null)
    }
    const commit = () => {
        const trimmed = draft.trim()
        if (trimmed === value) return
        if (!trimmed) {
            setError(`${field === 'title' ? 'Title' : 'Subtitle'} is required.`)

            return
        }
        if (!session.setMetadataField(field, trimmed)) setError(`${field} could not be saved.`)
    }
    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            setDraftState({ base: value, value })
            setError(null)

            return
        }
        if (event.key !== 'Enter' || (field === 'description' && !event.ctrlKey)) return
        event.preventDefault()
        commit()
    }
    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => event.stopPropagation()

    return (
        <TextField
            error={!!error}
            helperText={error}
            multiline={field === 'description'}
            onBlur={commit}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPointerDown={handlePointerDown}
            size="small"
            slotProps={{ htmlInput: { 'aria-label': field === 'title' ? 'Diagram title' : 'Diagram subtitle' } }}
            sx={{ '& .MuiInputBase-input': diagramFontStyle(undefined, fontScalePercent, field === 'title' ? 'h6' : 'body2'), minWidth: 240 }}
            value={draft}
            variant="standard"
        />
    )
}

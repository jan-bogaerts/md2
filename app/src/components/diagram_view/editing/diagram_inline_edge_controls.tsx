import { TextField } from '@mui/material'
import {
    useCallback, useEffect, useRef, useState, useSyncExternalStore,
    type ChangeEvent, type KeyboardEvent, type MouseEvent, type PointerEvent,
} from 'react'
import type { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import type { DiagramWaypoint } from '../../../services/diagrams/diagram_data'
import {
    diagramLabelFocusService, type DiagramLabelFocusService,
} from '../../../services/diagrams/diagram_label_focus_service'
import type { PositionedDiagramEdge } from '../../../services/diagrams/diagram_layout'

const EDGE_EDITOR_HEIGHT = 32
const EDGE_EDITOR_MINIMUM_WIDTH = 96
const EDGE_EDITOR_HORIZONTAL_OFFSET = 20
const EDGE_EDITOR_VERTICAL_OFFSET = 12

function midpoint(start: DiagramWaypoint, end: DiagramWaypoint) {
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
}

function editorCentre(edge: PositionedDiagramEdge) {
    if (edge.labelPlacement) {
        const { height, width, x, y } = edge.labelPlacement

        return { x: x + width / 2, y: y + height / 2 }
    }
    if (edge.controlPoint) {
        const start = edge.points[0]
        const end = edge.points.at(-1) as DiagramWaypoint

        return {
            x: (start.x + 2 * edge.controlPoint.x + end.x) / 4,
            y: (start.y + 2 * edge.controlPoint.y + end.y) / 4,
        }
    }
    const segments = edge.points.slice(1).map((end, index) => {
        const start = edge.points[index]

        return { end, length: Math.abs(end.x - start.x) + Math.abs(end.y - start.y), start }
    })
    const longest = segments.sort((left, right) => right.length - left.length)[0]
    if (!longest) return midpoint(edge.points[0], edge.points[0])
    const centre = midpoint(longest.start, longest.end)

    return longest.start.y === longest.end.y
        ? { x: centre.x, y: centre.y - EDGE_EDITOR_HORIZONTAL_OFFSET }
        : { x: centre.x + EDGE_EDITOR_VERTICAL_OFFSET + EDGE_EDITOR_MINIMUM_WIDTH / 2, y: centre.y }
}

/** Inline label editor positioned beside one editable connection. */
export function DiagramInlineEdgeControls({
    edge,
    labelFocus = diagramLabelFocusService,
    onOpenDetails,
    session,
}: {
    edge: PositionedDiagramEdge
    labelFocus?: DiagramLabelFocusService
    onOpenDetails: () => void
    session: DiagramEditSessionService
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const subscribeFocus = useCallback((listener: () => void) => (
        labelFocus.subscribeFocus('edge', edge.id, listener)
    ), [edge.id, labelFocus])
    const getFocusSnapshot = useCallback(() => labelFocus.getFocusSnapshot('edge', edge.id), [edge.id, labelFocus])
    const focusRequested = useSyncExternalStore(subscribeFocus, getFocusSnapshot, getFocusSnapshot)
    const label = edge.label ?? ''
    const [editing, setEditing] = useState(false)
    const [focused, setFocused] = useState(false)
    const [draftState, setDraftState] = useState({ base: label, value: label })
    const draft = draftState.base === label ? draftState.value : label
    const [error, setError] = useState<string | null>(null)
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setDraftState({ base: label, value: event.target.value })
        setError(null)
    }
    const commit = () => {
        const nextLabel = draft.trim() || undefined
        if (nextLabel === edge.label) return true
        const saved = session.objects.setEdgeField(edge.id, 'label', nextLabel)
        if (!saved) setError('Label could not be saved.')

        return saved
    }
    const handleBlur = () => {
        const saved = commit()
        setFocused(false)
        if (saved) setEditing(false)
    }
    const handleFocus = () => setFocused(true)
    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            event.stopPropagation()
            setDraftState({ base: label, value: label })
            setError(null)

            return
        }
        if (event.key !== 'Enter') return
        event.preventDefault()
        commit()
    }
    const stopPointer = (event: PointerEvent<SVGForeignObjectElement>) => event.stopPropagation()
    const stopClick = (event: MouseEvent<SVGForeignObjectElement>) => event.stopPropagation()
    const handleDoubleClick = (event: MouseEvent<SVGForeignObjectElement>) => {
        event.stopPropagation()
        onOpenDetails()
    }
    const centre = editorCentre(edge)
    const restingWidth = edge.labelPlacement?.width ?? EDGE_EDITOR_MINIMUM_WIDTH
    const width = focused || focusRequested || editing
        ? Math.max(EDGE_EDITOR_MINIMUM_WIDTH, restingWidth)
        : restingWidth

    useEffect(() => {
        if (!focusRequested || !inputRef.current) return

        setEditing(true)
        inputRef.current.focus()
        inputRef.current.select()
        labelFocus.complete({ objectId: edge.id, objectKind: 'edge' })
    }, [edge.id, focusRequested, labelFocus])

    if (!edge.label && !focusRequested && !editing) return null

    return (
        <foreignObject
            height={EDGE_EDITOR_HEIGHT}
            onClick={stopClick}
            onDoubleClick={handleDoubleClick}
            onPointerDown={stopPointer}
            style={{ overflow: 'visible', pointerEvents: 'auto' }}
            width={width}
            x={centre.x - width / 2}
            y={centre.y - EDGE_EDITOR_HEIGHT / 2}
        >
            <TextField
                error={!!error}
                helperText={error}
                inputRef={inputRef}
                onBlur={handleBlur}
                onChange={handleChange}
                onFocus={handleFocus}
                onKeyDown={handleKeyDown}
                size="small"
                slotProps={{ htmlInput: { 'aria-label': `Edit ${edge.label ?? 'connection'} label` } }}
                sx={{
                    pointerEvents: 'auto', width: '100%',
                    '& .MuiInputBase-root': { bgcolor: 'custom.projectBackground' },
                    '& .MuiInputBase-input': { py: 0.25, textAlign: 'center' },
                }}
                value={draft}
                variant="standard"
            />
        </foreignObject>
    )
}

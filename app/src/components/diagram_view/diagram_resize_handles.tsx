import { Box } from '@mui/material'
import { useCallback, useSyncExternalStore } from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramResizeDirection } from '../../services/diagrams/diagram_resize_service'
import {
    diagramSelectionService, type DiagramSelectionIdentity, type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'

interface DiagramResizeHandlesProps {
    geometry?: DiagramGeometryService
    selection?: DiagramSelectionService
    session?: DiagramEditSessionService
}

interface ResizeHandleDefinition {
    cursor: string
    direction: DiagramResizeDirection
}

const RESIZE_HANDLES: readonly ResizeHandleDefinition[] = [
    { cursor: 'nwse-resize', direction: 'north-west' },
    { cursor: 'ns-resize', direction: 'north' },
    { cursor: 'nesw-resize', direction: 'north-east' },
    { cursor: 'ew-resize', direction: 'east' },
    { cursor: 'nwse-resize', direction: 'south-east' },
    { cursor: 'ns-resize', direction: 'south' },
    { cursor: 'nesw-resize', direction: 'south-west' },
    { cursor: 'ew-resize', direction: 'west' },
]
const EMPTY_RESIZABLE_IDENTITY: DiagramSelectionIdentity = Object.freeze({ objectId: '', objectKind: 'node' })

function useResizableGeometryField(
    identity: DiagramSelectionIdentity,
    field: 'height' | 'width' | 'x' | 'y',
    geometry: DiagramGeometryService,
) {
    const subscribe = useCallback((listener: () => void) => {
        const unsubscribeField = identity.objectKind === 'node'
            ? geometry.subscribeNodeGeometryField(identity.objectId, field, listener)
            : geometry.subscribeGroupGeometryField(identity.objectId, field, listener)
        const unsubscribeSession = geometry.subscribeGeometrySession(listener)

        return () => {
            unsubscribeField()
            unsubscribeSession()
        }
    }, [field, geometry, identity.objectId, identity.objectKind])
    const getSnapshot = useCallback(() => (
        identity.objectKind === 'node'
            ? geometry.getNodeGeometryFieldSnapshot(identity.objectId, field)
            : geometry.getGroupGeometryFieldSnapshot(identity.objectId, field)
    ), [field, geometry, identity.objectId, identity.objectKind])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function useResizableObjectLabel(identity: DiagramSelectionIdentity, session: DiagramEditSessionService) {
    const subscribe = useCallback((listener: () => void) => (
        identity.objectKind === 'node'
            ? session.subscribeNodeField(identity.objectId, 'label', listener)
            : session.subscribeGroupField(identity.objectId, 'label', listener)
    ), [identity.objectId, identity.objectKind, session])
    const getSnapshot = useCallback(() => (
        identity.objectKind === 'node'
            ? session.getNodeFieldSnapshot(identity.objectId, 'label')
            : session.getGroupFieldSnapshot(identity.objectId, 'label')
    ), [identity.objectId, identity.objectKind, session])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function handlePosition(direction: DiagramResizeDirection, x: number, y: number, width: number, height: number) {
    const left = direction.includes('west') ? x : direction.includes('east') ? x + width : x + width / 2
    const top = direction.includes('north') ? y : direction.includes('south') ? y + height : y + height / 2

    return { left, top }
}

/** Accessible resize controls for one selected node or independent group. */
export function DiagramResizeHandles({
    geometry = diagramGeometryService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: DiagramResizeHandlesProps) {
    const selected = useSyncExternalStore(
        selection.subscribeSelection,
        selection.getSelectionSnapshot,
        selection.getSelectionSnapshot,
    )
    const resizable = selected.length === 1 && selected[0].objectKind !== 'edge'
    const identity = resizable ? selected[0] : EMPTY_RESIZABLE_IDENTITY
    const height = useResizableGeometryField(identity, 'height', geometry)
    const width = useResizableGeometryField(identity, 'width', geometry)
    const x = useResizableGeometryField(identity, 'x', geometry)
    const y = useResizableGeometryField(identity, 'y', geometry)
    const label = useResizableObjectLabel(identity, session)
    if (!resizable || height === null || width === null || x === null || y === null || typeof label !== 'string') return null

    return RESIZE_HANDLES.map(({ cursor, direction }) => {
        const position = handlePosition(direction, x, y, width, height)

        return (
            <Box
                aria-label={`Resize ${label} ${direction}`}
                component="button"
                data-diagram-resize-direction={direction}
                data-diagram-resize-handle="true"
                data-diagram-resize-object-id={identity.objectId}
                data-diagram-resize-object-kind={identity.objectKind}
                key={direction}
                sx={{
                    bgcolor: 'background.paper', border: '2px solid', borderColor: 'primary.main', cursor,
                    height: (theme) => theme.spacing(1.5), p: 0, position: 'absolute', touchAction: 'none',
                    transform: 'translate(-50%, -50%)', width: (theme) => theme.spacing(1.5), zIndex: 4,
                    ...position,
                    '&:focus-visible': { bgcolor: 'custom.primaryBg', outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
                type="button"
            />
        )
    })
}

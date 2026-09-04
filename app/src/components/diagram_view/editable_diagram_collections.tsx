import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import {
    diagramSelectionService, type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import { EditableDiagramActivation } from './editable_diagram_activation'
import { EditableDiagramEdge } from './editable_diagram_edge'
import { EditableDiagramFragment } from './editable_diagram_fragment'
import { EditableDiagramGroup } from './editable_diagram_group'
import { EditableDiagramLifeline } from './editable_diagram_lifeline'
import { EditableDiagramNode } from './editable_diagram_node'
import { useDiagramActivationIds, useDiagramFragmentIds } from './use_diagram_geometry'
import {
    useEditableDiagramEdgeIds, useEditableDiagramGroupIds, useEditableDiagramNodeIds,
} from './use_editable_diagram'

interface CollectionHostProps {
    geometry?: DiagramGeometryService
    session?: DiagramEditSessionService
}

interface SelectableCollectionHostProps extends CollectionHostProps {
    selection?: DiagramSelectionService
}

/**
 * Every host below observes one ordered identifier list and nothing else. A field edit inside a member changes no
 * identifier list, so the host is skipped and only the member leaf rerenders.
 */
export function EditableDiagramNodes({
    geometry = diagramGeometryService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: SelectableCollectionHostProps) {
    const nodeIds = useEditableDiagramNodeIds(session)

    return nodeIds.map((nodeId) => (
        <EditableDiagramNode geometry={geometry} key={nodeId} nodeId={nodeId} selection={selection} session={session} />
    ))
}

export function EditableDiagramLifelines({
    geometry = diagramGeometryService,
    session = diagramEditSessionService,
}: CollectionHostProps) {
    const nodeIds = useEditableDiagramNodeIds(session)

    return nodeIds.map((nodeId) => (
        <EditableDiagramLifeline geometry={geometry} key={nodeId} nodeId={nodeId} session={session} />
    ))
}

export function EditableDiagramEdges({
    geometry = diagramGeometryService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: SelectableCollectionHostProps) {
    const edgeIds = useEditableDiagramEdgeIds(session)

    return (
        <svg
            aria-label="New diagram connections"
            height="100%"
            style={{ left: 0, overflow: 'visible', pointerEvents: 'none', position: 'absolute', top: 0, zIndex: 1 }}
            width="100%"
        >
            {edgeIds.map((edgeId) => (
                <EditableDiagramEdge edgeId={edgeId} geometry={geometry} key={edgeId} selection={selection} session={session} />
            ))}
        </svg>
    )
}

export function EditableDiagramGroups({
    geometry = diagramGeometryService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: SelectableCollectionHostProps) {
    const groupIds = useEditableDiagramGroupIds(session)

    return groupIds.map((groupId) => (
        <EditableDiagramGroup geometry={geometry} groupId={groupId} key={groupId} selection={selection} session={session} />
    ))
}

export function EditableDiagramFragments({
    geometry = diagramGeometryService,
    session = diagramEditSessionService,
}: CollectionHostProps) {
    const fragmentIds = useDiagramFragmentIds(geometry)

    return fragmentIds.map((fragmentId) => (
        <EditableDiagramFragment fragmentId={fragmentId} geometry={geometry} key={fragmentId} session={session} />
    ))
}

export function EditableDiagramActivations({ geometry = diagramGeometryService }: CollectionHostProps) {
    const activationIds = useDiagramActivationIds(geometry)

    return activationIds.map((activationId) => (
        <EditableDiagramActivation activationId={activationId} geometry={geometry} key={activationId} />
    ))
}

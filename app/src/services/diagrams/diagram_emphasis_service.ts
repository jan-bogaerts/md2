import { register } from '../service_injector'
import type { DiagramData, DiagramEdge } from './diagram_data'
import {
    diagramEditSessionService,
    type DiagramEditSessionService,
} from './diagram_edit_session_service'
import type {
    ReadonlyDiagramData,
} from './diagram_edit_types'
import { diagramViewService, type DiagramViewService } from './diagram_view_service'

const TARGET_CHANGED_EVENT = 'targetChanged'
const DECORATIONS_CHANGED_EVENT_PREFIX = 'decorationsChanged'
const DIMMED_CHANGED_EVENT_PREFIX = 'dimmedChanged'

export type DiagramEmphasisObjectKind = 'edge' | 'node'
export type DiagramSurface = 'current' | 'new'

export interface DiagramEmphasisTarget {
    diagramId: string
    objectId: string
    objectKind: DiagramEmphasisObjectKind
    surface: DiagramSurface
}

interface DiagramEmphasisSource {
    diagram: DiagramData | ReadonlyDiagramData
    diagramId: string
}

interface DiagramEmphasisState {
    edgeIds: ReadonlySet<string>
    nodeIds: ReadonlySet<string>
    source: DiagramEmphasisSource
    target: DiagramEmphasisTarget
}

type EmphasisEditSession = Pick<DiagramEditSessionService,
    'getEditableDiagram'
    | 'getEdgeIdsSnapshot'
    | 'getSessionSnapshot'
    | 'subscribeCollectionMembership'
    | 'subscribeEdgeField'
    | 'subscribeSession'>

type EmphasisDiagramView = Pick<DiagramViewService, 'getSourceSnapshot' | 'subscribeSource'>

function dimmedChangedEvent(surface: DiagramSurface, objectKind: DiagramEmphasisObjectKind, objectId: string) {
    return `${DIMMED_CHANGED_EVENT_PREFIX}:${surface}:${objectKind}:${objectId}`
}

function decorationsChangedEvent(surface: DiagramSurface) {
    return `${DECORATIONS_CHANGED_EVENT_PREFIX}:${surface}`
}

function sameTarget(left: DiagramEmphasisTarget | null, right: DiagramEmphasisTarget | null) {
    return left?.diagramId === right?.diagramId
        && left?.objectId === right?.objectId
        && left?.objectKind === right?.objectKind
        && left?.surface === right?.surface
}

function relatedObjectIds(diagram: DiagramData | ReadonlyDiagramData, target: DiagramEmphasisTarget) {
    const nodeIds = new Set<string>()
    const edgeIds = new Set<string>()
    if (target.objectKind === 'edge') {
        const edge = diagram.edges.find(({ id }) => id === target.objectId)
        if (!edge) return null
        edgeIds.add(edge.id)
        nodeIds.add(edge.from)
        nodeIds.add(edge.to)

        return { edgeIds, nodeIds }
    }

    if (!diagram.nodes.some(({ id }) => id === target.objectId)) return null
    nodeIds.add(target.objectId)
    diagram.edges.forEach((edge) => {
        if (edge.from !== target.objectId && edge.to !== target.objectId) return
        edgeIds.add(edge.id)
        nodeIds.add(edge.from)
        nodeIds.add(edge.to)
    })

    return { edgeIds, nodeIds }
}

function isObjectDimmed(
    state: DiagramEmphasisState | null,
    surface: DiagramSurface,
    objectKind: DiagramEmphasisObjectKind,
    objectId: string,
) {
    if (!state || state.target.surface !== surface) return false

    return !(objectKind === 'node' ? state.nodeIds : state.edgeIds).has(objectId)
}

function objectIds(source: DiagramEmphasisSource | null, objectKind: DiagramEmphasisObjectKind) {
    if (!source) return []

    return objectKind === 'node'
        ? source.diagram.nodes.map(({ id }) => id)
        : source.diagram.edges.map(({ id }) => id)
}

/** Owns one active diagram-emphasis target and granular dimmed snapshots. */
export class DiagramEmphasisService extends EventTarget {
    private readonly editSession: EmphasisEditSession
    private edgeFieldUnsubscribers: (() => void)[] = []
    private started = false
    private state: DiagramEmphasisState | null = null
    private readonly view: EmphasisDiagramView

    constructor(
        view: EmphasisDiagramView = diagramViewService,
        editSession: EmphasisEditSession = diagramEditSessionService,
    ) {
        super()
        this.view = view
        this.editSession = editSession
    }

    getTargetSnapshot = () => this.state?.target ?? null

    getDimmedSnapshot = (
        surface: DiagramSurface,
        objectKind: DiagramEmphasisObjectKind,
        objectId: string,
    ) => isObjectDimmed(this.state, surface, objectKind, objectId)

    getDecorationsDimmedSnapshot = (surface: DiagramSurface) => this.state?.target.surface === surface

    subscribeTarget = (listener: () => void) => {
        this.addEventListener(TARGET_CHANGED_EVENT, listener)

        return () => this.removeEventListener(TARGET_CHANGED_EVENT, listener)
    }

    subscribeDimmed = (
        surface: DiagramSurface,
        objectKind: DiagramEmphasisObjectKind,
        objectId: string,
        listener: () => void,
    ) => {
        const eventType = dimmedChangedEvent(surface, objectKind, objectId)
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }

    subscribeDecorationsDimmed = (surface: DiagramSurface, listener: () => void) => {
        const eventType = decorationsChangedEvent(surface)
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }

    start() {
        if (this.started) return
        this.started = true
        this.view.subscribeSource(this.handleSourceChange)
        this.editSession.subscribeSession(this.handleSessionChange)
        this.editSession.subscribeCollectionMembership('edge', this.handleEditableCollectionChange)
        this.editSession.subscribeCollectionMembership('node', this.handleEditableCollectionChange)
        this.refreshEdgeFieldSubscriptions()
    }

    emphasize(target: DiagramEmphasisTarget) {
        const source = this.sourceForTarget(target)
        const relatedIds = relatedObjectIds(source.diagram, target)
        if (!relatedIds) throw new Error(`Cannot emphasize missing diagram ${target.objectKind}: ${target.objectId}`)
        this.applyState({ ...relatedIds, source, target })
    }

    moveTargetIfActive(target: DiagramEmphasisTarget) {
        if (!this.state) return false
        this.emphasize(target)

        return true
    }

    clear() {
        this.applyState(null)
    }

    private readonly handleSourceChange = () => {
        if (this.state?.target.surface === 'current') this.clear()
    }

    private readonly handleSessionChange = () => {
        this.refreshEdgeFieldSubscriptions()
        if (this.state?.target.surface !== 'new') return
        const session = this.editSession.getSessionSnapshot()
        if (!session || session.sourceDiagramId !== this.state.target.diagramId) this.clear()
    }

    private readonly handleEditableCollectionChange = () => {
        this.refreshEdgeFieldSubscriptions()
        this.recomputeNewState()
    }

    private readonly handleEditableEdgeEndpointChange = () => this.recomputeNewState()

    private sourceForTarget(target: DiagramEmphasisTarget): DiagramEmphasisSource {
        if (target.surface === 'current') {
            const source = this.view.getSourceSnapshot()
            if (!source || source.record.id !== target.diagramId) throw new Error('Current diagram emphasis target does not match active source')

            return { diagram: source.diagram, diagramId: source.record.id }
        }
        const session = this.editSession.getSessionSnapshot()
        const diagram = this.editSession.getEditableDiagram()
        if (!session || !diagram || session.sourceDiagramId !== target.diagramId) {
            throw new Error('New diagram emphasis target does not match active edit session')
        }

        return { diagram, diagramId: session.sourceDiagramId }
    }

    private recomputeNewState() {
        const target = this.state?.target
        if (!target || target.surface !== 'new') return
        const session = this.editSession.getSessionSnapshot()
        const diagram = this.editSession.getEditableDiagram()
        if (!session || !diagram || session.sourceDiagramId !== target.diagramId) {
            this.clear()

            return
        }
        const relatedIds = relatedObjectIds(diagram, target)
        if (!relatedIds) {
            this.clear()

            return
        }
        this.applyState({ ...relatedIds, source: { diagram, diagramId: session.sourceDiagramId }, target })
    }

    private refreshEdgeFieldSubscriptions() {
        this.edgeFieldUnsubscribers.forEach((unsubscribe) => unsubscribe())
        this.edgeFieldUnsubscribers = this.editSession.getEdgeIdsSnapshot().flatMap((edgeId) => [
            this.editSession.subscribeEdgeField(edgeId, 'from' satisfies keyof DiagramEdge, this.handleEditableEdgeEndpointChange),
            this.editSession.subscribeEdgeField(edgeId, 'to' satisfies keyof DiagramEdge, this.handleEditableEdgeEndpointChange),
        ])
    }

    private applyState(nextState: DiagramEmphasisState | null) {
        const previousState = this.state
        const targetChanged = !sameTarget(previousState?.target ?? null, nextState?.target ?? null)
        this.state = nextState
        const sources = [previousState?.source ?? null, nextState?.source ?? null]
        const surfaces: DiagramSurface[] = ['current', 'new']
        const objectKinds: DiagramEmphasisObjectKind[] = ['node', 'edge']
        surfaces.forEach((surface) => {
            objectKinds.forEach((objectKind) => {
                const ids = new Set(sources.flatMap((source) => objectIds(source, objectKind)))
                ids.forEach((objectId) => {
                    const wasDimmed = isObjectDimmed(previousState, surface, objectKind, objectId)
                    const isDimmed = isObjectDimmed(nextState, surface, objectKind, objectId)
                    if (wasDimmed !== isDimmed) this.dispatchEvent(new Event(dimmedChangedEvent(surface, objectKind, objectId)))
                })
            })
            const decorationsWereDimmed = previousState?.target.surface === surface
            const decorationsAreDimmed = nextState?.target.surface === surface
            if (decorationsWereDimmed !== decorationsAreDimmed) {
                this.dispatchEvent(new Event(decorationsChangedEvent(surface)))
            }
        })
        if (targetChanged) this.dispatchEvent(new Event(TARGET_CHANGED_EVENT))
    }
}

export const diagramEmphasisService = register(
    'diagramEmphasisService',
    new DiagramEmphasisService(),
)

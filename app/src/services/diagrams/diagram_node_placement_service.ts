import { register } from '../service_injector'
import {
    requireDiagramNodeKind,
    type DiagramFlowPreset,
    type DiagramNode,
    type DiagramNodeKind,
    type DiagramType,
} from './diagram_data'
import {
    diagramEditSessionService,
    type DiagramEditSessionService,
    type NewDiagramNode,
} from './diagram_edit_session_service'
import { DIAGRAM_GRID_SIZE, type PositionedDiagramNode } from './diagram_layout'
import {
    diagramSelectionService,
    type DiagramSelectionService,
} from './diagram_selection_service'

const PREVIEW_CHANGED_EVENT = 'nodePlacement:preview'
const PREVIEW_NODE_ID = 'node-placement-preview'

export interface DiagramNodePlacementPoint {
    x: number
    y: number
}

export type DiagramNodePlacementDefaults = Omit<NewDiagramNode, 'kind' | 'x' | 'y'>

export interface DiagramNodePlacementPreviewSize {
    height: number
    width: number
}

export interface DiagramNodePlacementDefinition {
    defaults: DiagramNodePlacementDefaults
    kind: DiagramNodeKind
    previewSize?: DiagramNodePlacementPreviewSize
}

export interface DiagramNodePlacementPreview {
    diagramType: DiagramType
    flowPreset?: DiagramFlowPreset
    node: PositionedDiagramNode
}

function snapCoordinate(value: number) {
    return Math.round(value / DIAGRAM_GRID_SIZE) * DIAGRAM_GRID_SIZE
}

function requireFinitePoint(point: DiagramNodePlacementPoint) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new Error('Diagram node placement point must be finite')
    }
}

function cloneDefaults(defaults: DiagramNodePlacementDefaults): DiagramNodePlacementDefaults {
    return {
        ...defaults,
        ...(defaults.fields ? { fields: defaults.fields.map((field) => ({ ...field })) } : {}),
    }
}

function samePreviewPoint(preview: DiagramNodePlacementPreview | null, x: number, y: number) {
    return preview?.node.x === x && preview.node.y === y
}

function previewSize(definition: DiagramNodePlacementDefinition) {
    const height = definition.previewSize?.height ?? definition.defaults.height
    const width = definition.previewSize?.width ?? definition.defaults.width
    if (height === undefined || width === undefined) {
        throw new Error('Diagram node placement requires preview dimensions')
    }

    return { height, width }
}

/** Owns one node tool from activation through transient preview and one committed placement. */
export class DiagramNodePlacementService extends EventTarget {
    private definition: DiagramNodePlacementDefinition | null = null
    private preview: DiagramNodePlacementPreview | null = null
    private readonly selection: Pick<DiagramSelectionService, 'replace'>
    private readonly session: DiagramEditSessionService

    constructor(
        session: DiagramEditSessionService = diagramEditSessionService,
        selection: Pick<DiagramSelectionService, 'replace'> = diagramSelectionService,
    ) {
        super()
        this.selection = selection
        this.session = session
        this.session.subscribeActiveTool(this.handleActiveToolChanged)
        this.session.subscribeSession(this.handleSessionChanged)
    }

    getPreviewSnapshot = () => this.preview

    subscribePreview = (listener: () => void) => {
        this.addEventListener(PREVIEW_CHANGED_EVENT, listener)

        return () => this.removeEventListener(PREVIEW_CHANGED_EVENT, listener)
    }

    isNodeKindAvailable(kind: DiagramNodeKind) {
        if (!this.session.getSessionSnapshot()) return false

        const diagramType = this.session.getMetadataFieldSnapshot('type')
        const flowPreset = this.session.getMetadataFieldSnapshot('preset')
        if (!diagramType) return false

        try {
            requireDiagramNodeKind(kind, diagramType, flowPreset ?? undefined, 'node.kind')

            return true
        } catch {
            return false
        }
    }

    isPlacementActive() {
        return !!this.definition && this.session.getActiveToolSnapshot() === `node:${this.definition.kind}`
    }

    activate(definition: DiagramNodePlacementDefinition) {
        if (!this.session.getSessionSnapshot()) throw new Error('Cannot activate node placement without an active edit session')
        if (!this.isNodeKindAvailable(definition.kind)) return false

        this.definition = {
            defaults: cloneDefaults(definition.defaults),
            kind: definition.kind,
            ...(definition.previewSize ? { previewSize: { ...definition.previewSize } } : {}),
        }
        this.setPreview(null)
        this.session.setActiveTool(`node:${definition.kind}`)

        return true
    }

    updatePreview(point: DiagramNodePlacementPoint) {
        requireFinitePoint(point)
        const definition = this.requireActiveDefinition()
        const diagramType = this.session.getMetadataFieldSnapshot('type')
        const flowPreset = this.session.getMetadataFieldSnapshot('preset')
        if (!diagramType) throw new Error('Cannot preview node placement without diagram metadata')

        const x = snapCoordinate(point.x)
        const y = snapCoordinate(point.y)
        if (samePreviewPoint(this.preview, x, y)) return false

        const modelNode: DiagramNode = { ...cloneDefaults(definition.defaults), id: PREVIEW_NODE_ID, kind: definition.kind, x, y }
        const { height, width } = previewSize(definition)
        const node: PositionedDiagramNode = { ...modelNode, fanIn: 0, height, width, x, y }
        const preview = {
            diagramType,
            ...(flowPreset ? { flowPreset } : {}),
            node,
        }
        this.setPreview(preview)
        this.session.beginTransientGesture('placement')

        return true
    }

    place(point: DiagramNodePlacementPoint) {
        this.updatePreview(point)
        const definition = this.requireActiveDefinition()
        const preview = this.preview
        if (!preview) throw new Error('Cannot place a diagram node without a preview')

        const node: NewDiagramNode = {
            ...cloneDefaults(definition.defaults),
            kind: definition.kind,
            x: preview.node.x,
            y: preview.node.y,
        }
        const nodeId = this.session.createNode(node)
        if (!nodeId) return null

        this.selection.replace([{ objectId: nodeId, objectKind: 'node' }])
        this.definition = null
        this.setPreview(null)
        this.session.setActiveTool('select')

        return nodeId
    }

    cancelPlacement() {
        if (!this.definition && !this.preview) return false

        this.definition = null
        this.setPreview(null)
        this.session.cancelActiveInteraction()

        return true
    }

    private readonly handleActiveToolChanged = () => {
        if (this.isPlacementActive()) return

        this.clearPlacement()
    }

    private readonly handleSessionChanged = () => this.clearPlacement()

    private clearPlacement() {
        this.definition = null
        this.setPreview(null)
    }

    private requireActiveDefinition() {
        if (!this.definition || !this.isPlacementActive()) throw new Error('No diagram node placement is active')

        return this.definition
    }

    private setPreview(preview: DiagramNodePlacementPreview | null) {
        if (preview === this.preview) return

        this.preview = preview
        this.dispatchEvent(new Event(PREVIEW_CHANGED_EVENT))
    }
}

export const diagramNodePlacementService = register(
    'diagramNodePlacementService',
    new DiagramNodePlacementService(),
)

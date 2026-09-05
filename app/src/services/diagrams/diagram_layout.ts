import dagre from '@dagrejs/dagre'
import type {
    DiagramConnectionPoint,
    DiagramData,
    DiagramEdge,
    DiagramGroup,
    DiagramNode,
    DiagramSequenceFragment,
    DiagramSequenceOperator,
    DiagramWaypoint,
} from './diagram_data'

export const DIAGRAM_GRID_SIZE = 4
export const MINIMUM_DIAGRAM_GROUP_WIDTH = 48
export const MINIMUM_DIAGRAM_GROUP_HEIGHT = 56
const GRID_SIZE = DIAGRAM_GRID_SIZE
const SURFACE_PADDING = 40
const DEFAULT_NODE_WIDTH = 160
const DEFAULT_NODE_HEIGHT = 72
const ENTITY_FIELD_HEIGHT = 20
const ENTITY_HEADER_HEIGHT = 48
const RANK_GAP = 96
const NODE_GAP = 48
const SEQUENCE_COLUMN_GAP = 56
const SEQUENCE_MESSAGE_GAP = 48
const SEQUENCE_MESSAGE_START = 152
const GROUP_HORIZONTAL_PADDING = 24
const GROUP_HEADER_HEIGHT = 32
const GROUP_BOTTOM_PADDING = 24
const CONNECTOR_CLEARANCE = 20
const EDGE_LABEL_HEIGHT = 12
const EDGE_LABEL_GAP = 8

export interface PositionedDiagramNode extends DiagramNode {
    fanIn: number
    height: number
    width: number
    x: number
    y: number
}

export interface PositionedSequenceActivation {
    height: number
    id: string
    width: number
    x: number
    y: number
}

export interface PositionedSequenceFragment {
    dividerY?: number
    guardPositions: { guard: string, y: number }[]
    height: number
    id: string
    operator: DiagramSequenceOperator
    width: number
    x: number
    y: number
}

export interface PositionedDiagramEdge extends DiagramEdge {
    labelPlacement?: PositionedDiagramLabel
    points: DiagramWaypoint[]
}

export interface EdgeGeometry {
    basePoints: DiagramWaypoint[]
    labelPlacement: PositionedDiagramLabel | undefined
    points: DiagramWaypoint[]
}

export interface PositionedDiagramLabel {
    height: number
    textX: number
    textY: number
    width: number
    x: number
    y: number
}

export interface PositionedDiagramGroup extends DiagramGroup {
    height: number
    width: number
    x: number
    y: number
}

export interface PositionedDiagramData extends Omit<DiagramData, 'edges' | 'fragments' | 'groups' | 'nodes'> {
    activations: PositionedSequenceActivation[]
    edges: PositionedDiagramEdge[]
    fragments: PositionedSequenceFragment[]
    groups: PositionedDiagramGroup[]
    height: number
    nodes: PositionedDiagramNode[]
    width: number
}

function snap(value: number) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE
}

/** Returns deterministic Y geometry for one zero-based sequence message row. */
export function sequenceMessageRowY(rowIndex: number) {
    return snap(SEQUENCE_MESSAGE_START + rowIndex * SEQUENCE_MESSAGE_GAP)
}

/** Maps diagram-space Y to a valid insertion index in the ordered sequence message collection. */
export function sequenceMessageInsertionIndexAt(y: number, messageCount: number) {
    if (!Number.isFinite(y)) throw new Error('Sequence message position must be finite')
    if (!Number.isInteger(messageCount) || messageCount < 0) throw new Error('Sequence message count must be a non-negative integer')

    return Math.min(Math.max(Math.round((y - SEQUENCE_MESSAGE_START) / SEQUENCE_MESSAGE_GAP), 0), messageCount)
}

function nodeHeight(data: DiagramData, node: DiagramNode) {
    if (node.height !== undefined) return node.height
    if (node.fields) return snap(ENTITY_HEADER_HEIGHT + node.fields.length * ENTITY_FIELD_HEIGHT)
    if (data.meta.type === 'flow' && node.kind === 'decision') return 96
    if (data.meta.type === 'flow' && (node.kind === 'start' || node.kind === 'end')) return data.meta.preset === 'state' ? 24 : 48

    return DEFAULT_NODE_HEIGHT
}

function nodeWidth(data: DiagramData, node: DiagramNode) {
    if (node.width !== undefined) return node.width
    if (data.meta.type === 'flow' && node.kind === 'decision') return 96
    if (data.meta.type === 'flow' && (node.kind === 'start' || node.kind === 'end')) return data.meta.preset === 'state' ? 24 : 120

    return DEFAULT_NODE_WIDTH
}

/** Counts the incoming edges a node renders as fan-in. Presentation `cycle` edges never contribute. */
export function nodeFanIn(edges: readonly DiagramEdge[], nodeId: string) {
    return edges.filter(({ kind, to }) => to === nodeId && kind !== 'cycle').length
}

/** Builds one node's positioned view from its model data; supplied coordinates and sizes stay authoritative. */
export function nodeGeometry(data: DiagramData, node: DiagramNode, x: number, y: number): PositionedDiagramNode {
    const defaultKinds = { architecture: 'component', dependency: 'component', entity: 'entity', sequence: 'participant' } as const

    return {
        ...node,
        fanIn: nodeFanIn(data.edges, node.id),
        height: nodeHeight(data, node),
        ...(node.kind === undefined && data.meta.type !== 'flow' ? { kind: defaultKinds[data.meta.type] } : {}),
        width: nodeWidth(data, node),
        x: node.x ?? snap(x),
        y: node.y ?? snap(y),
    }
}

/** Builds the Dagre input graph. Self-edges and presentation `cycle` edges are excluded so they cannot influence ranks. */
function layeredGraph(data: DiagramData) {
    const graph = new dagre.graphlib.Graph()
    graph.setGraph({
        marginx: SURFACE_PADDING,
        marginy: SURFACE_PADDING,
        nodesep: NODE_GAP,
        rankdir: 'TB',
        ranksep: RANK_GAP,
    })
    graph.setDefaultEdgeLabel(() => ({}))
    const known = new Set<string>()
    for (const node of data.nodes) {
        if (known.has(node.id)) continue
        known.add(node.id)
        graph.setNode(node.id, { height: nodeHeight(data, node), width: nodeWidth(data, node) })
    }
    const added = new Set<string>()
    for (const { from, kind, to } of data.edges) {
        if (kind === 'cycle' || from === to || !known.has(from) || !known.has(to)) continue
        const key = JSON.stringify([from, to])
        if (added.has(key)) continue
        added.add(key)
        graph.setEdge(from, to)
    }

    return graph
}

/**
 * Places layered nodes with Dagre. Dagre reports node centres, so each centre is converted to a top-left
 * corner and snapped to the grid; `positionedNode` then keeps any supplied coordinate as authoritative.
 * A Dagre failure propagates as a layout failure rather than falling back to partial geometry.
 */
function layoutLayeredNodes(data: DiagramData) {
    const graph = layeredGraph(data)
    dagre.layout(graph)

    return data.nodes.map((node) => {
        const placement = graph.node(node.id)
        const width = nodeWidth(data, node)
        const height = nodeHeight(data, node)

        return nodeGeometry(data, node, (placement?.x ?? SURFACE_PADDING) - width / 2, (placement?.y ?? SURFACE_PADDING) - height / 2)
    })
}

function layoutSequenceNodes(data: DiagramData) {
    let x = SURFACE_PADDING

    return data.nodes.map((node) => {
        const result = nodeGeometry(data, node, x, SURFACE_PADDING)
        x += result.width + SEQUENCE_COLUMN_GAP

        return result
    })
}

type NodeSide = 'bottom' | 'left' | 'right' | 'top'

function nodeCenter(node: PositionedDiagramNode) {
    return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
}

function edgeSide(edge: DiagramEdge, field: 'from' | 'to', nodes: Map<string, PositionedDiagramNode>): NodeSide {
    const node = nodes.get(edge[field]) as PositionedDiagramNode
    const otherId = field === 'from' ? edge.to : edge.from
    const other = nodes.get(otherId) as PositionedDiagramNode
    const center = nodeCenter(node)
    const otherCenter = nodeCenter(other)
    const horizontalDistance = Math.abs(otherCenter.x - center.x)
    const verticalDistance = Math.abs(otherCenter.y - center.y)
    if (verticalDistance >= horizontalDistance) return otherCenter.y >= center.y ? 'bottom' : 'top'

    return otherCenter.x >= center.x ? 'right' : 'left'
}

function absoluteConnectionPoint(connectionPoint: DiagramConnectionPoint, node: PositionedDiagramNode) {
    const { offset, side } = connectionPoint
    if (side === 'top') return { x: node.x + node.width * offset, y: node.y }
    if (side === 'bottom') return { x: node.x + node.width * offset, y: node.y + node.height }
    if (side === 'left') return { x: node.x, y: node.y + node.height * offset }

    return { x: node.x + node.width, y: node.y + node.height * offset }
}

function endpointAttachment(edge: DiagramEdge, field: 'from' | 'to') {
    return field === 'from' ? edge.sourceAttachment : edge.targetAttachment
}

function endpointSide(edge: DiagramEdge, field: 'from' | 'to', nodes: Map<string, PositionedDiagramNode>): NodeSide {
    return endpointAttachment(edge, field)?.side ?? edgeSide(edge, field, nodes)
}

function portPoint(
    edge: DiagramEdge,
    edges: DiagramEdge[],
    field: 'from' | 'to',
    nodes: Map<string, PositionedDiagramNode>,
) {
    const node = nodes.get(edge[field]) as PositionedDiagramNode
    const side = edgeSide(edge, field, nodes)
    const matches = edges.filter((candidate) => {
        const candidateField = candidate.from === node.id ? 'from' : candidate.to === node.id ? 'to' : null

        return candidateField !== null && edgeSide(candidate, candidateField, nodes) === side
    })
    const index = matches.findIndex(({ id }) => id === edge.id)
    const horizontal = side === 'bottom' || side === 'top'
    const sideLength = horizontal ? node.width : node.height
    // Ports spread evenly across the side; on a node too small for distinct ports they clamp onto shared grid positions.
    const offset = snap(sideLength * (index + 1) / (matches.length + 1))
    if (side === 'top') return { x: node.x + offset, y: node.y }
    if (side === 'bottom') return { x: node.x + offset, y: node.y + node.height }
    if (side === 'left') return { x: node.x, y: node.y + offset }

    return { x: node.x + node.width, y: node.y + offset }
}

function edgeEndpoint(
    edge: DiagramEdge,
    edges: DiagramEdge[],
    field: 'from' | 'to',
    nodes: Map<string, PositionedDiagramNode>,
) {
    const attachment = endpointAttachment(edge, field)
    const node = nodes.get(edge[field]) as PositionedDiagramNode

    return attachment ? absoluteConnectionPoint(attachment, node) : portPoint(edge, edges, field, nodes)
}

function samePoint(left: DiagramWaypoint, right: DiagramWaypoint) {
    return left.x === right.x && left.y === right.y
}

function usesSuppliedRoute(edge: DiagramEdge, nodes: Map<string, PositionedDiagramNode>) {
    if (!edge.waypoints) return false
    const first = edge.waypoints[0]
    const last = edge.waypoints.at(-1) as DiagramWaypoint
    const from = nodes.get(edge.from) as PositionedDiagramNode
    const to = nodes.get(edge.to) as PositionedDiagramNode
    const sourceMatches = !edge.sourceAttachment
        || samePoint(first, absoluteConnectionPoint(edge.sourceAttachment, from))
    const targetMatches = !edge.targetAttachment
        || samePoint(last, absoluteConnectionPoint(edge.targetAttachment, to))

    return sourceMatches && targetMatches
}

function segmentIntersectsNode(start: DiagramWaypoint, end: DiagramWaypoint, node: PositionedDiagramNode) {
    if (start.y === end.y) {
        return start.y > node.y && start.y < node.y + node.height
            && Math.max(start.x, end.x) > node.x && Math.min(start.x, end.x) < node.x + node.width
    }
    if (start.x === end.x) {
        return start.x > node.x && start.x < node.x + node.width
            && Math.max(start.y, end.y) > node.y && Math.min(start.y, end.y) < node.y + node.height
    }

    return true
}

function segmentsOverlap(
    start: DiagramWaypoint,
    end: DiagramWaypoint,
    otherStart: DiagramWaypoint,
    otherEnd: DiagramWaypoint,
) {
    const horizontal = start.y === end.y
    if (horizontal !== (otherStart.y === otherEnd.y)) return false
    if (horizontal && start.y !== otherStart.y) return false
    if (!horizontal && start.x !== otherStart.x) return false
    const startValue = horizontal ? start.x : start.y
    const endValue = horizontal ? end.x : end.y
    const otherStartValue = horizontal ? otherStart.x : otherStart.y
    const otherEndValue = horizontal ? otherEnd.x : otherEnd.y

    return Math.min(Math.max(startValue, endValue), Math.max(otherStartValue, otherEndValue))
        - Math.max(Math.min(startValue, endValue), Math.min(otherStartValue, otherEndValue)) > 0
}

function routePenalty(
    edge: DiagramEdge,
    points: DiagramWaypoint[],
    nodes: PositionedDiagramNode[],
    priorEdges: PositionedDiagramEdge[],
) {
    let obstacles = 0
    let overlaps = 0
    let length = 0
    for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1]
        const end = points[index]
        length += Math.abs(end.x - start.x) + Math.abs(end.y - start.y)
        obstacles += nodes.filter(({ id }) => id !== edge.from && id !== edge.to)
            .filter((node) => segmentIntersectsNode(start, end, node)).length
        for (const priorEdge of priorEdges) {
            for (let priorIndex = 1; priorIndex < priorEdge.points.length; priorIndex += 1) {
                if (segmentsOverlap(start, end, priorEdge.points[priorIndex - 1], priorEdge.points[priorIndex])) overlaps += 1
            }
        }
    }

    return obstacles * 100000 + overlaps * 10000 + length
}

function bestRoute(
    edge: DiagramEdge,
    candidates: DiagramWaypoint[][],
    nodes: PositionedDiagramNode[],
    priorEdges: PositionedDiagramEdge[],
) {
    // Each candidate is scored once; the lowest penalty wins even when it still crosses a node or overlaps an earlier edge.
    let route = candidates[0]
    let lowest = Number.POSITIVE_INFINITY
    for (const candidate of candidates) {
        const penalty = routePenalty(edge, candidate, nodes, priorEdges)
        if (penalty < lowest) {
            lowest = penalty
            route = candidate
        }
    }

    return route
}

function dependencyCyclePoints(
    edge: DiagramEdge,
    nodes: Map<string, PositionedDiagramNode>,
    priorEdges: PositionedDiagramEdge[],
) {
    const from = nodes.get(edge.from) as PositionedDiagramNode
    const to = nodes.get(edge.to) as PositionedDiagramNode
    const positionedNodes = [...nodes.values()]
    const bottom = snap(Math.max(...positionedNodes.map(({ height, y }) => y + height)) + CONNECTOR_CLEARANCE * 2)
    const left = snap(Math.min(...positionedNodes.map(({ x }) => x)) - CONNECTOR_CLEARANCE * 2)
    const right = snap(Math.max(...positionedNodes.map(({ width, x }) => x + width)) + CONNECTOR_CLEARANCE * 2)
    const candidates = [
        [
            { x: snap(from.x + from.width / 3), y: from.y + from.height }, { x: snap(from.x + from.width / 3), y: bottom },
            { x: snap(to.x + to.width * 2 / 3), y: bottom }, { x: snap(to.x + to.width * 2 / 3), y: to.y + to.height },
        ],
        [
            { x: from.x, y: snap(from.y + from.height / 3) }, { x: left, y: snap(from.y + from.height / 3) },
            { x: left, y: snap(to.y + to.height * 2 / 3) }, { x: to.x, y: snap(to.y + to.height * 2 / 3) },
        ],
        [
            { x: from.x + from.width, y: snap(from.y + from.height / 3) }, { x: right, y: snap(from.y + from.height / 3) },
            { x: right, y: snap(to.y + to.height * 2 / 3) },
            { x: to.x + to.width, y: snap(to.y + to.height * 2 / 3) },
        ],
    ]

    return bestRoute(edge, candidates, positionedNodes, priorEdges)
}

function selfLoopPoints(
    edge: DiagramEdge,
    node: PositionedDiagramNode,
    nodes: PositionedDiagramNode[],
    priorEdges: PositionedDiagramEdge[],
) {
    const candidates = [
        [
            { x: snap(node.x + node.width / 3), y: node.y }, { x: snap(node.x + node.width / 3), y: node.y - 20 },
            { x: snap(node.x + node.width * 2 / 3), y: node.y - 20 }, { x: snap(node.x + node.width * 2 / 3), y: node.y },
        ],
        [
            { x: node.x + node.width, y: snap(node.y + node.height / 3) },
            { x: node.x + node.width + 32, y: snap(node.y + node.height / 3) },
            { x: node.x + node.width + 32, y: snap(node.y + node.height * 2 / 3) },
            { x: node.x + node.width, y: snap(node.y + node.height * 2 / 3) },
        ],
        [
            { x: snap(node.x + node.width / 3), y: node.y + node.height },
            { x: snap(node.x + node.width / 3), y: node.y + node.height + 32 },
            { x: snap(node.x + node.width * 2 / 3), y: node.y + node.height + 32 },
            { x: snap(node.x + node.width * 2 / 3), y: node.y + node.height },
        ],
    ]

    return bestRoute(edge, candidates, nodes, priorEdges)
}

function graphEdgePoints(
    data: DiagramData,
    edge: DiagramEdge,
    nodes: Map<string, PositionedDiagramNode>,
    priorEdges: PositionedDiagramEdge[],
) {
    if (usesSuppliedRoute(edge, nodes)) return edge.waypoints as DiagramWaypoint[]
    const positionedNodes = [...nodes.values()]
    const hasAttachment = !!edge.sourceAttachment || !!edge.targetAttachment
    if (!hasAttachment && data.meta.type === 'dependency' && edge.kind === 'cycle') {
        return dependencyCyclePoints(edge, nodes, priorEdges)
    }
    const from = nodes.get(edge.from) as PositionedDiagramNode
    if (!hasAttachment && edge.from === edge.to) return selfLoopPoints(edge, from, positionedNodes, priorEdges)
    const start = edgeEndpoint(edge, data.edges, 'from', nodes)
    const end = edgeEndpoint(edge, data.edges, 'to', nodes)
    const fromSide = endpointSide(edge, 'from', nodes)
    const toSide = endpointSide(edge, 'to', nodes)
    const fromVertical = fromSide === 'bottom' || fromSide === 'top'
    const toVertical = toSide === 'bottom' || toSide === 'top'
    if (fromVertical !== toVertical) {
        const exit = fromVertical
            ? { x: start.x, y: start.y + (fromSide === 'bottom' ? CONNECTOR_CLEARANCE : -CONNECTOR_CLEARANCE) }
            : { x: start.x + (fromSide === 'right' ? CONNECTOR_CLEARANCE : -CONNECTOR_CLEARANCE), y: start.y }
        const entry = toVertical
            ? { x: end.x, y: end.y + (toSide === 'bottom' ? CONNECTOR_CLEARANCE : -CONNECTOR_CLEARANCE) }
            : { x: end.x + (toSide === 'right' ? CONNECTOR_CLEARANCE : -CONNECTOR_CLEARANCE), y: end.y }
        const candidates = [
            [start, exit, { x: entry.x, y: exit.y }, entry, end],
            [start, exit, { x: exit.x, y: entry.y }, entry, end],
        ]

        return bestRoute(edge, candidates, positionedNodes, priorEdges)
    }
    const verticalRoute = fromVertical
    if (verticalRoute) {
        const horizontalLanes = positionedNodes.flatMap((node) => [
            snap(node.x - CONNECTOR_CLEARANCE), snap(node.x + node.width + CONNECTOR_CLEARANCE),
        ])
        const verticalLanes = [snap((start.y + end.y) / 2), ...positionedNodes.flatMap((node) => [
            snap(node.y - CONNECTOR_CLEARANCE), snap(node.y + node.height + CONNECTOR_CLEARANCE),
        ])]
        const exitY = start.y + (fromSide === 'bottom' ? CONNECTOR_CLEARANCE : -CONNECTOR_CLEARANCE)
        const entryY = end.y + (toSide === 'bottom' ? CONNECTOR_CLEARANCE : -CONNECTOR_CLEARANCE)
        const candidates = [...new Set(verticalLanes)].map((middleY) => [
            start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end,
        ])
        candidates.push(...[...new Set(horizontalLanes)].map((middleX) => [
            start, { x: start.x, y: exitY }, { x: middleX, y: exitY },
            { x: middleX, y: entryY }, { x: end.x, y: entryY }, end,
        ]))

        return bestRoute(edge, candidates, positionedNodes, priorEdges)
    }
    const verticalLanes = positionedNodes.flatMap((node) => [
        snap(node.y - CONNECTOR_CLEARANCE), snap(node.y + node.height + CONNECTOR_CLEARANCE),
    ])
    const horizontalLanes = [snap((start.x + end.x) / 2), ...positionedNodes.flatMap((node) => [
        snap(node.x - CONNECTOR_CLEARANCE), snap(node.x + node.width + CONNECTOR_CLEARANCE),
    ])]
    const exitX = start.x + (fromSide === 'right' ? CONNECTOR_CLEARANCE : -CONNECTOR_CLEARANCE)
    const entryX = end.x + (toSide === 'right' ? CONNECTOR_CLEARANCE : -CONNECTOR_CLEARANCE)
    const candidates = [...new Set(horizontalLanes)].map((middleX) => [
        start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end,
    ])
    candidates.push(...[...new Set(verticalLanes)].map((middleY) => [
        start, { x: exitX, y: start.y }, { x: exitX, y: middleY },
        { x: entryX, y: middleY }, { x: entryX, y: end.y }, end,
    ]))

    return bestRoute(edge, candidates, positionedNodes, priorEdges)
}

function sequenceEdgePoints(edge: DiagramEdge, index: number, nodes: Map<string, PositionedDiagramNode>) {
    if (usesSuppliedRoute(edge, nodes)) return edge.waypoints as DiagramWaypoint[]
    const from = nodes.get(edge.from) as PositionedDiagramNode
    const to = nodes.get(edge.to) as PositionedDiagramNode
    const rowY = sequenceMessageRowY(index)
    const automaticStart = { x: snap(from.x + from.width / 2), y: rowY }
    const automaticEnd = { x: snap(to.x + to.width / 2), y: rowY }
    const start = edge.sourceAttachment ? absoluteConnectionPoint(edge.sourceAttachment, from) : automaticStart
    const end = edge.targetAttachment ? absoluteConnectionPoint(edge.targetAttachment, to) : automaticEnd
    if (edge.sourceAttachment || edge.targetAttachment) {
        return [start, { x: start.x, y: rowY }, { x: end.x, y: rowY }, end]
    }
    const startX = automaticStart.x
    const endX = automaticEnd.x
    if (edge.from === edge.to) {
        return [
            { x: startX, y: rowY },
            { x: startX + 32, y: rowY },
            { x: startX + 32, y: rowY + 24 },
            { x: startX, y: rowY + 24 },
        ]
    }

    return [{ x: startX, y: rowY }, { x: endX, y: rowY }]
}

function betweenWithMargin(value: number, start: number, end: number) {
    const minimum = Math.min(start, end) + GRID_SIZE
    const maximum = Math.max(start, end) - GRID_SIZE

    return value > minimum && value < maximum
}

function crossingPoint(
    start: DiagramWaypoint,
    end: DiagramWaypoint,
    otherStart: DiagramWaypoint,
    otherEnd: DiagramWaypoint,
) {
    const horizontal = start.y === end.y
    const otherHorizontal = otherStart.y === otherEnd.y
    if (horizontal === otherHorizontal) return null
    const horizontalStart = horizontal ? start : otherStart
    const horizontalEnd = horizontal ? end : otherEnd
    const verticalStart = horizontal ? otherStart : start
    const verticalEnd = horizontal ? otherEnd : end
    const x = verticalStart.x
    const y = horizontalStart.y
    if (!betweenWithMargin(x, horizontalStart.x, horizontalEnd.x)) return null
    if (!betweenWithMargin(y, verticalStart.y, verticalEnd.y)) return null

    return { x, y }
}

function segmentCrossings(start: DiagramWaypoint, end: DiagramWaypoint, priorEdges: PositionedDiagramEdge[]) {
    const crossings: DiagramWaypoint[] = []
    for (const { points } of priorEdges) {
        for (let index = 1; index < points.length; index += 1) {
            const crossing = crossingPoint(start, end, points[index - 1], points[index])
            if (crossing && !crossings.some(({ x, y }) => crossing.x === x && crossing.y === y)) crossings.push(crossing)
        }
    }
    const horizontal = start.y === end.y
    const direction = horizontal ? Math.sign(end.x - start.x) : Math.sign(end.y - start.y)
    crossings.sort((left, right) => direction * (horizontal ? left.x - right.x : left.y - right.y))

    return crossings
}

function bridgePoints(start: DiagramWaypoint, end: DiagramWaypoint, crossing: DiagramWaypoint) {
    const horizontal = start.y === end.y
    const direction = horizontal ? Math.sign(end.x - start.x) : Math.sign(end.y - start.y)
    if (horizontal) {
        return [
            { x: crossing.x - direction * 8, y: crossing.y },
            { x: crossing.x, y: crossing.y - 8 },
            { x: crossing.x + direction * 8, y: crossing.y },
        ]
    }

    return [
        { x: crossing.x, y: crossing.y - direction * 8 },
        { x: crossing.x + 8, y: crossing.y },
        { x: crossing.x, y: crossing.y + direction * 8 },
    ]
}

function addCrossingHops(points: DiagramWaypoint[], priorEdges: PositionedDiagramEdge[]) {
    if (priorEdges.length === 0) return points
    const routed = [points[0]]
    for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1]
        const end = points[index]
        const crossings = segmentCrossings(start, end, priorEdges)
        for (const crossing of crossings) routed.push(...bridgePoints(start, end, crossing))
        routed.push(end)
    }

    return routed
}

function pointOnNodeBoundary(point: DiagramWaypoint, node: PositionedDiagramNode) {
    const onHorizontalEdge = (point.y === node.y || point.y === node.y + node.height)
        && point.x >= node.x && point.x <= node.x + node.width
    const onVerticalEdge = (point.x === node.x || point.x === node.x + node.width)
        && point.y >= node.y && point.y <= node.y + node.height

    return onHorizontalEdge || onVerticalEdge
}

function validateSuppliedRoute(
    edge: DiagramEdge,
    points: DiagramWaypoint[],
    nodes: Map<string, PositionedDiagramNode>,
    priorEdges: PositionedDiagramEdge[],
) {
    const from = nodes.get(edge.from) as PositionedDiagramNode
    const to = nodes.get(edge.to) as PositionedDiagramNode
    if (!pointOnNodeBoundary(points[0], from) || !pointOnNodeBoundary(points.at(-1) as DiagramWaypoint, to)) {
        throw new Error(`Malformed diagram data: edge ${edge.id} waypoints do not attach to endpoint boundaries`)
    }
    for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1]
        const end = points[index]
        const obstacle = [...nodes.values()].find((node) => node.id !== edge.from && node.id !== edge.to
            && segmentIntersectsNode(start, end, node))
        if (obstacle) throw new Error(`Malformed diagram data: edge ${edge.id} crosses node ${obstacle.id}`)
        for (const priorEdge of priorEdges) {
            for (let priorIndex = 1; priorIndex < priorEdge.points.length; priorIndex += 1) {
                if (segmentsOverlap(start, end, priorEdge.points[priorIndex - 1], priorEdge.points[priorIndex])) {
                    throw new Error(`Malformed diagram data: edge ${edge.id} overlaps edge ${priorEdge.id}`)
                }
                if (crossingPoint(start, end, priorEdge.points[priorIndex - 1], priorEdge.points[priorIndex])) {
                    throw new Error(`Malformed diagram data: edge ${edge.id} crosses edge ${priorEdge.id} without a bridge`)
                }
            }
        }
    }
}

function edgeRoutingPriority(edge: DiagramEdge) {
    return ['async', 'cycle', 'return'].includes(edge.kind) ? 1 : 0
}

function rectangleIntersectsNode(rectangle: PositionedDiagramLabel, node: PositionedDiagramNode) {
    return rectangle.x < node.x + node.width && rectangle.x + rectangle.width > node.x
        && rectangle.y < node.y + node.height && rectangle.y + rectangle.height > node.y
}

function edgeLabelPlacement(
    edge: DiagramEdge,
    points: DiagramWaypoint[],
    nodes: PositionedDiagramNode[],
): PositionedDiagramLabel | undefined {
    const label = edge.label ?? (edge.kind === 'cycle' ? 'CYCLE' : null)
    if (!label) return undefined
    const width = Math.max(24, Math.ceil((label.length * 5 + 8) / GRID_SIZE) * GRID_SIZE)
    const segments = points.slice(1).map((end, index) => {
        const start = points[index]

        return { end, length: Math.abs(end.x - start.x) + Math.abs(end.y - start.y), start }
    }).filter(({ end, start }) => end.x === start.x || end.y === start.y)
        .sort((left, right) => right.length - left.length)
    let fallback: PositionedDiagramLabel | undefined
    for (const { end, start } of segments) {
        const middleX = (start.x + end.x) / 2
        const middleY = (start.y + end.y) / 2
        const placement = start.y === end.y ? {
            height: EDGE_LABEL_HEIGHT, textX: middleX, textY: middleY - EDGE_LABEL_GAP - 3,
            width, x: middleX - width / 2, y: middleY - 20,
        } : {
            height: EDGE_LABEL_HEIGHT, textX: middleX + EDGE_LABEL_GAP + width / 2, textY: middleY + 3,
            width, x: middleX + EDGE_LABEL_GAP, y: middleY - 6,
        }
        if (!nodes.some((node) => rectangleIntersectsNode(placement, node))) return placement
        fallback = fallback ?? placement
    }

    // A crowded diagram places the label on its longest segment rather than failing the whole layout.
    return fallback
}

/**
 * Routes one edge against the current node positions. `basePoints` is the route before crossing bridges are added and
 * is what later edges must be scored against; `points` is what the renderer draws.
 */
export function edgeGeometry(
    data: DiagramData,
    edge: DiagramEdge,
    nodes: Map<string, PositionedDiagramNode>,
    priorEdges: PositionedDiagramEdge[],
): EdgeGeometry {
    const index = data.edges.findIndex(({ id }) => id === edge.id)
    const suppliedRoute = usesSuppliedRoute(edge, nodes)
    const points = data.meta.type === 'sequence'
        ? sequenceEdgePoints(edge, index, nodes)
        : graphEdgePoints(data, edge, nodes, priorEdges)
    if (suppliedRoute && data.meta.type !== 'sequence') validateSuppliedRoute(edge, points, nodes, priorEdges)
    const routedPoints = suppliedRoute ? points : addCrossingHops(points, priorEdges)
    const labelPlacement = edgeLabelPlacement(edge, routedPoints, [...nodes.values()])

    return { basePoints: points, labelPlacement, points: routedPoints }
}

function layoutEdges(data: DiagramData, positionedNodes: PositionedDiagramNode[]) {
    const nodes = new Map(positionedNodes.map((node) => [node.id, node]))
    const baseEdges: PositionedDiagramEdge[] = []
    const positionedEdges: PositionedDiagramEdge[] = []
    const routeOrder = data.meta.type === 'sequence' ? data.edges : [...data.edges].sort((left, right) => {
        return edgeRoutingPriority(left) - edgeRoutingPriority(right)
            || data.edges.indexOf(left) - data.edges.indexOf(right)
    })
    routeOrder.forEach((edge) => {
        const { basePoints, labelPlacement, points } = edgeGeometry(data, edge, nodes, baseEdges)
        baseEdges.push({ ...edge, points: basePoints })
        positionedEdges.push({
            ...edge,
            ...(labelPlacement ? { labelPlacement } : {}),
            points,
        })
    })

    return [...positionedEdges].sort((left, right) => data.edges.findIndex(({ id }) => id === left.id)
        - data.edges.findIndex(({ id }) => id === right.id))
}

/**
 * Positions one group. A group carrying persisted geometry keeps it, because F_255 groups are positioned and sized
 * independently of their members; only an omitted field falls back to the member-extent box.
 */
export function groupBox(group: DiagramGroup, nodesById: Map<string, PositionedDiagramNode>): PositionedDiagramGroup {
    const members = group.nodeIds.map((id) => nodesById.get(id) as PositionedDiagramNode)
    if (members.length === 0) {
        return {
            ...group,
            height: group.height ?? GROUP_HEADER_HEIGHT + GROUP_BOTTOM_PADDING,
            width: group.width ?? GROUP_HORIZONTAL_PADDING * 2,
            x: group.x ?? SURFACE_PADDING,
            y: group.y ?? SURFACE_PADDING,
        }
    }
    const left = Math.min(...members.map(({ x }) => x))
    const top = Math.min(...members.map(({ y }) => y))
    const right = Math.max(...members.map(({ width, x }) => x + width))
    const bottom = Math.max(...members.map(({ height, y }) => y + height))

    return {
        ...group,
        height: group.height ?? snap(bottom - top + GROUP_HEADER_HEIGHT + GROUP_BOTTOM_PADDING),
        width: group.width ?? snap(right - left + GROUP_HORIZONTAL_PADDING * 2),
        x: group.x ?? snap(left - GROUP_HORIZONTAL_PADDING),
        y: group.y ?? snap(top - GROUP_HEADER_HEIGHT),
    }
}

function layoutGroups(groups: DiagramGroup[], nodes: PositionedDiagramNode[]) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]))

    return groups.map((group) => groupBox(group, nodesById))
}

/** Builds the activation bars of one participant from the call and reply messages that touch its lifeline. */
export function nodeActivations(node: PositionedDiagramNode, edges: PositionedDiagramEdge[], bottom: number) {
    const activations: PositionedSequenceActivation[] = []
    const stack: { depth: number, edge: PositionedDiagramEdge }[] = []
    const events = edges.filter(({ from, kind, to }) => (to === node.id && kind === 'call')
        || (from === node.id && (kind === 'return' || kind === 'success')))
    for (const edge of events) {
        if (edge.to === node.id && edge.kind === 'call') {
            stack.push({ depth: stack.length, edge })

            continue
        }
        const call = stack.pop()
        if (!call) continue
        const start = call.edge.points[0]?.y ?? 0
        const end = edge.points[0]?.y ?? bottom
        activations.push({
            height: Math.max(24, end - start), id: `${node.id}:${call.edge.id}`, width: 8,
            x: snap(node.x + node.width / 2 - 4 + call.depth * 4), y: start,
        })
    }
    for (const call of stack) {
        const start = call.edge.points[0]?.y ?? 0
        activations.push({
            height: Math.max(24, bottom - start), id: `${node.id}:${call.edge.id}`, width: 8,
            x: snap(node.x + node.width / 2 - 4 + call.depth * 4), y: start,
        })
    }

    return activations
}

function layoutSequenceActivations(edges: PositionedDiagramEdge[], nodes: PositionedDiagramNode[], bottom: number) {
    return nodes.flatMap((node) => nodeActivations(node, edges, bottom)).sort((left, right) => left.y - right.y)
}

function fragmentEdges(fragment: DiagramSequenceFragment, edges: PositionedDiagramEdge[]) {
    const edgeIds = new Set(fragment.regions.flatMap(({ edgeIds: regionEdgeIds }) => regionEdgeIds))

    return edges.filter(({ id }) => edgeIds.has(id))
}

/** Boxes one fragment around the participants and message rows its regions reference. */
export function sequenceFragmentBox(
    fragment: DiagramSequenceFragment,
    edges: PositionedDiagramEdge[],
    nodesById: Map<string, PositionedDiagramNode>,
): PositionedSequenceFragment {
    const members = fragmentEdges(fragment, edges)
    const participantIds = new Set(members.flatMap(({ from, to }) => [from, to]))
    const participantCenters = [...participantIds].map((id) => nodeCenter(nodesById.get(id) as PositionedDiagramNode).x)
    const rows = members.map(({ points }) => points[0].y)
    const x = snap(Math.min(...participantCenters) - 16)
    const y = snap(Math.min(...rows) - 32)
    const right = snap(Math.max(...participantCenters) + 16)
    const bottom = snap(Math.max(...rows) + 24)
    const guardPositions = fragment.regions.map(({ edgeIds, guard }) => {
        const firstRow = Math.min(...edges.filter(({ id }) => edgeIds.includes(id)).map(({ points }) => points[0].y))

        return { guard, y: snap(firstRow - 12) }
    })

    return {
        ...(fragment.regions.length === 2 ? { dividerY: snap(guardPositions[1].y - 12) } : {}),
        guardPositions, height: bottom - y, id: fragment.id, operator: fragment.operator, width: right - x, x, y,
    }
}

function layoutSequenceFragments(
    fragments: DiagramSequenceFragment[],
    edges: PositionedDiagramEdge[],
    nodes: PositionedDiagramNode[],
) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]))

    return fragments.map((fragment) => sequenceFragmentBox(fragment, edges, nodesById))
}

/** Measures the surface from already-positioned objects. It reads cached geometry only; it never routes or lays out. */
export function surfaceSize(
    nodes: PositionedDiagramNode[],
    edges: PositionedDiagramEdge[],
    groups: PositionedDiagramGroup[],
    fragments: PositionedSequenceFragment[] = [],
    activations: PositionedSequenceActivation[] = [],
) {
    const horizontalValues = [
        ...nodes.map(({ width, x }) => x + width),
        ...edges.flatMap(({ labelPlacement, points }) => [
            ...points.map(({ x }) => x), ...(labelPlacement ? [labelPlacement.x + labelPlacement.width] : []),
        ]),
        ...groups.map(({ width, x }) => x + width),
        ...fragments.map(({ width, x }) => x + width),
        ...activations.map(({ width, x }) => x + width),
    ]
    const verticalValues = [
        ...nodes.map(({ height, y }) => y + height),
        ...edges.flatMap(({ labelPlacement, points }) => [
            ...points.map(({ y }) => y), ...(labelPlacement ? [labelPlacement.y + labelPlacement.height] : []),
        ]),
        ...groups.map(({ height, y }) => y + height),
        ...fragments.map(({ height, y }) => y + height),
        ...activations.map(({ height, y }) => y + height),
    ]

    return {
        height: snap(Math.max(SURFACE_PADDING, ...verticalValues) + SURFACE_PADDING),
        width: snap(Math.max(SURFACE_PADDING, ...horizontalValues) + SURFACE_PADDING),
    }
}

/** Fill missing diagram geometry while preserving every supplied coordinate, size, and waypoint. */
export function layout(data: DiagramData): PositionedDiagramData {
    const nodes = data.meta.type === 'sequence' ? layoutSequenceNodes(data) : layoutLayeredNodes(data)
    const edges = layoutEdges(data, nodes)
    const groups = layoutGroups(data.groups, nodes)
    const initialSize = surfaceSize(nodes, edges, groups)
    const activations = data.meta.type === 'sequence' ? layoutSequenceActivations(edges, nodes, initialSize.height - 24) : []
    const fragments = data.meta.type === 'sequence' ? layoutSequenceFragments(data.fragments ?? [], edges, nodes) : []
    const { height, width } = surfaceSize(nodes, edges, groups, fragments, activations)

    return { ...data, activations, edges, fragments, groups, height, nodes, width }
}

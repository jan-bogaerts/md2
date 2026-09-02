export const DIAGRAM_DATA_VERSION = 1

export const DIAGRAM_TYPES = ['architecture', 'dependency', 'sequence', 'flow', 'entity'] as const
export const DIAGRAM_ROLES = ['focal', 'backend', 'store', 'external', 'input', 'optional', 'boundary'] as const
export const DIAGRAM_NODE_KINDS = ['component', 'participant', 'step', 'decision', 'start', 'end', 'state', 'entity'] as const
export const DIAGRAM_EDGE_KINDS = [
    'connection', 'data', 'dependency', 'cycle', 'call', 'return', 'async', 'success', 'flow', 'transition', 'relationship',
] as const
export const DIAGRAM_FLOW_PRESETS = ['flowchart', 'state'] as const
export const DIAGRAM_CARDINALITIES = ['1', 'N', '0..1', '1..*'] as const
export const DIAGRAM_SEQUENCE_OPERATORS = ['alt', 'opt', 'loop'] as const

export type DiagramType = typeof DIAGRAM_TYPES[number]
export type DiagramRole = typeof DIAGRAM_ROLES[number]
export type DiagramNodeKind = typeof DIAGRAM_NODE_KINDS[number]
export type DiagramEdgeKind = typeof DIAGRAM_EDGE_KINDS[number]
export type DiagramFlowPreset = typeof DIAGRAM_FLOW_PRESETS[number]
export type DiagramCardinality = typeof DIAGRAM_CARDINALITIES[number]
export type DiagramSequenceOperator = typeof DIAGRAM_SEQUENCE_OPERATORS[number]

export interface DiagramLegendItem {
    label: string
    role: DiagramRole
}

export interface DiagramMeta {
    description: string
    legend?: DiagramLegendItem[]
    preset?: DiagramFlowPreset
    title: string
    type: DiagramType
    version: typeof DIAGRAM_DATA_VERSION
}

export interface DiagramEntityField {
    key?: 'primary' | 'foreign'
    name: string
    type?: string
}

export interface DiagramNode {
    drilldown?: boolean
    fields?: DiagramEntityField[]
    height?: number
    id: string
    kind?: DiagramNodeKind
    label: string
    role: DiagramRole
    sublabel?: string
    tag?: string
    width?: number
    x?: number
    y?: number
}

export interface DiagramWaypoint {
    x: number
    y: number
}

export interface DiagramEdge {
    from: string
    fromCardinality?: DiagramCardinality
    id: string
    kind: DiagramEdgeKind
    label?: string
    to: string
    toCardinality?: DiagramCardinality
    waypoints?: DiagramWaypoint[]
}

export interface DiagramGroup {
    id: string
    label: string
    nodeIds: string[]
}

export interface DiagramSequenceFragmentRegion {
    edgeIds: string[]
    guard: string
}

export interface DiagramSequenceFragment {
    id: string
    operator: DiagramSequenceOperator
    regions: DiagramSequenceFragmentRegion[]
}

export interface DiagramData {
    edges: DiagramEdge[]
    fragments?: DiagramSequenceFragment[]
    groups: DiagramGroup[]
    meta: DiagramMeta
    nodes: DiagramNode[]
}

function malformed(field: string, reason = 'invalid value'): never {
    throw new Error(`Malformed diagram data: ${field} has ${reason}`)
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) malformed(field)

    return value as Record<string, unknown>
}

function requireArray(value: unknown, field: string) {
    if (!Array.isArray(value)) malformed(field, 'invalid array')

    return value
}

function requireString(value: unknown, field: string) {
    if (typeof value !== 'string' || value.trim().length === 0) malformed(field, 'invalid string')

    return value
}

function optionalString(value: unknown, field: string) {
    return value === undefined ? undefined : requireString(value, field)
}

function optionalBoolean(value: unknown, field: string) {
    if (value === undefined) return undefined
    if (typeof value !== 'boolean') malformed(field, 'invalid boolean')

    return value
}

function optionalNumber(value: unknown, field: string, positive = false) {
    if (value === undefined) return undefined
    if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value <= 0)) malformed(field, 'invalid number')

    return value
}

function requireGridNumber(value: unknown, field: string, positive = false) {
    const result = optionalNumber(value, field, positive)
    if (result === undefined || result % 4 !== 0) malformed(field, 'number outside the 4px grid')

    return result
}

function requireEnum<T extends string>(value: unknown, values: readonly T[], field: string): T {
    if (typeof value !== 'string' || !values.includes(value as T)) malformed(field, `unsupported value ${String(value)}`)

    return value as T
}

function optionalEnum<T extends string>(value: unknown, values: readonly T[], field: string): T | undefined {
    return value === undefined ? undefined : requireEnum(value, values, field)
}

function parseLegend(value: unknown) {
    if (value === undefined) return undefined

    return requireArray(value, 'meta.legend').map((entry, index): DiagramLegendItem => {
        const item = requireObject(entry, `meta.legend[${index}]`)

        return {
            label: requireString(item.label, `meta.legend[${index}].label`),
            role: requireEnum(item.role, DIAGRAM_ROLES, `meta.legend[${index}].role`),
        }
    })
}

function parseMeta(value: unknown): DiagramMeta {
    const meta = requireObject(value, 'meta')
    if (meta.version !== DIAGRAM_DATA_VERSION) malformed('meta.version', `unsupported value ${String(meta.version)}`)
    const type = requireEnum(meta.type, DIAGRAM_TYPES, 'meta.type')
    const preset = optionalEnum(meta.preset, DIAGRAM_FLOW_PRESETS, 'meta.preset')
    if (type === 'flow' && !preset) malformed('meta.preset', 'required value for flow diagrams')
    if (type !== 'flow' && preset) malformed('meta.preset', 'value only allowed for flow diagrams')

    const legend = parseLegend(meta.legend)

    return {
        description: requireString(meta.description, 'meta.description'),
        ...(legend ? { legend } : {}),
        ...(preset ? { preset } : {}),
        title: requireString(meta.title, 'meta.title'),
        type,
        version: DIAGRAM_DATA_VERSION,
    }
}

function parseEntityFields(value: unknown, field: string) {
    if (value === undefined) return undefined

    return requireArray(value, field).map((entry, index): DiagramEntityField => {
        const item = requireObject(entry, `${field}[${index}]`)
        const key = optionalEnum(item.key, ['primary', 'foreign'] as const, `${field}[${index}].key`)

        return {
            ...(key ? { key } : {}),
            name: requireString(item.name, `${field}[${index}].name`),
            ...(item.type === undefined ? {} : { type: requireString(item.type, `${field}[${index}].type`) }),
        }
    })
}

function parseNode(value: unknown, index: number): DiagramNode {
    const field = `nodes[${index}]`
    const node = requireObject(value, field)
    const kind = optionalEnum(node.kind, DIAGRAM_NODE_KINDS, `${field}.kind`)
    const fields = parseEntityFields(node.fields, `${field}.fields`)

    return {
        ...(node.drilldown === undefined ? {} : { drilldown: optionalBoolean(node.drilldown, `${field}.drilldown`) }),
        ...(fields ? { fields } : {}),
        ...(node.height === undefined ? {} : { height: requireGridNumber(node.height, `${field}.height`, true) }),
        id: requireString(node.id, `${field}.id`),
        ...(kind ? { kind } : {}),
        label: requireString(node.label, `${field}.label`),
        role: requireEnum(node.role, DIAGRAM_ROLES, `${field}.role`),
        ...(node.sublabel === undefined ? {} : { sublabel: optionalString(node.sublabel, `${field}.sublabel`) }),
        ...(node.tag === undefined ? {} : { tag: optionalString(node.tag, `${field}.tag`) }),
        ...(node.width === undefined ? {} : { width: requireGridNumber(node.width, `${field}.width`, true) }),
        ...(node.x === undefined ? {} : { x: requireGridNumber(node.x, `${field}.x`) }),
        ...(node.y === undefined ? {} : { y: requireGridNumber(node.y, `${field}.y`) }),
    }
}

function parseWaypoints(value: unknown, field: string) {
    if (value === undefined) return undefined

    const waypoints = requireArray(value, field).map((entry, index): DiagramWaypoint => {
        const waypoint = requireObject(entry, `${field}[${index}]`)

        return {
            x: requireGridNumber(waypoint.x, `${field}[${index}].x`),
            y: requireGridNumber(waypoint.y, `${field}[${index}].y`),
        }
    })
    if (waypoints.length < 2) malformed(field, 'fewer than two points')
    for (let index = 1; index < waypoints.length; index += 1) {
        const previous = waypoints[index - 1]
        const current = waypoints[index]
        if (previous.x !== current.x && previous.y !== current.y) malformed(`${field}[${index}]`, 'diagonal segment')
    }

    return waypoints
}

function parseEdge(value: unknown, index: number): DiagramEdge {
    const field = `edges[${index}]`
    const edge = requireObject(value, field)
    const fromCardinality = optionalEnum(edge.fromCardinality, DIAGRAM_CARDINALITIES, `${field}.fromCardinality`)
    const toCardinality = optionalEnum(edge.toCardinality, DIAGRAM_CARDINALITIES, `${field}.toCardinality`)
    const waypoints = parseWaypoints(edge.waypoints, `${field}.waypoints`)

    return {
        from: requireString(edge.from, `${field}.from`),
        ...(fromCardinality ? { fromCardinality } : {}),
        id: requireString(edge.id, `${field}.id`),
        kind: requireEnum(edge.kind, DIAGRAM_EDGE_KINDS, `${field}.kind`),
        ...(edge.label === undefined ? {} : { label: requireString(edge.label, `${field}.label`) }),
        to: requireString(edge.to, `${field}.to`),
        ...(toCardinality ? { toCardinality } : {}),
        ...(waypoints ? { waypoints } : {}),
    }
}

function parseGroup(value: unknown, index: number): DiagramGroup {
    const field = `groups[${index}]`
    const group = requireObject(value, field)

    const nodeIds = requireArray(group.nodeIds, `${field}.nodeIds`)
        .map((id, nodeIndex) => requireString(id, `${field}.nodeIds[${nodeIndex}]`))
    if (nodeIds.length === 0) malformed(`${field}.nodeIds`, 'empty array')

    return {
        id: requireString(group.id, `${field}.id`),
        label: requireString(group.label, `${field}.label`),
        nodeIds,
    }
}

function parseSequenceFragmentRegion(value: unknown, fragmentIndex: number, regionIndex: number): DiagramSequenceFragmentRegion {
    const field = `fragments[${fragmentIndex}].regions[${regionIndex}]`
    const region = requireObject(value, field)
    const edgeIds = requireArray(region.edgeIds, `${field}.edgeIds`)
        .map((id, edgeIndex) => requireString(id, `${field}.edgeIds[${edgeIndex}]`))
    if (edgeIds.length === 0) malformed(`${field}.edgeIds`, 'empty array')

    return { edgeIds, guard: requireString(region.guard, `${field}.guard`) }
}

function parseSequenceFragment(value: unknown, index: number): DiagramSequenceFragment {
    const field = `fragments[${index}]`
    const fragment = requireObject(value, field)

    return {
        id: requireString(fragment.id, `${field}.id`),
        operator: requireEnum(fragment.operator, DIAGRAM_SEQUENCE_OPERATORS, `${field}.operator`),
        regions: requireArray(fragment.regions, `${field}.regions`)
            .map((region, regionIndex) => parseSequenceFragmentRegion(region, index, regionIndex)),
    }
}

function requireUniqueIds(items: { id: string }[], field: string) {
    const ids = new Set<string>()
    for (const { id } of items) {
        if (ids.has(id)) malformed(field, `duplicate id ${id}`)
        ids.add(id)
    }

    return ids
}

function validateReferences(data: DiagramData) {
    const nodeIds = requireUniqueIds(data.nodes, 'nodes')
    if (nodeIds.size === 0) malformed('nodes', 'empty array')
    const edgeIds = requireUniqueIds(data.edges, 'edges')
    const duplicateSelectableId = [...edgeIds].find((id) => nodeIds.has(id))
    if (duplicateSelectableId) malformed('nodes and edges', `duplicate id ${duplicateSelectableId}`)
    requireUniqueIds(data.groups, 'groups')
    requireUniqueIds(data.fragments ?? [], 'fragments')
    for (const { from, id, to } of data.edges) {
        if (!nodeIds.has(from)) malformed(`edges.${id}.from`, `unknown node ${from}`)
        if (!nodeIds.has(to)) malformed(`edges.${id}.to`, `unknown node ${to}`)
    }
    for (const { id, nodeIds: groupNodeIds } of data.groups) {
        for (const nodeId of groupNodeIds) {
            if (!nodeIds.has(nodeId)) malformed(`groups.${id}.nodeIds`, `unknown node ${nodeId}`)
        }
    }
    for (const fragment of data.fragments ?? []) {
        for (const { edgeIds: regionEdgeIds } of fragment.regions) {
            for (const edgeId of regionEdgeIds) {
                if (!edgeIds.has(edgeId)) malformed(`fragments.${fragment.id}.regions.edgeIds`, `unknown edge ${edgeId}`)
            }
        }
    }
}

function validateSequenceFragments(data: DiagramData) {
    const fragments = data.fragments ?? []
    if (data.meta.type !== 'sequence' && fragments.length > 0) malformed('fragments', 'value only allowed for sequence diagrams')
    for (const { id, operator, regions } of fragments) {
        const requiredRegionCount = operator === 'alt' ? 2 : 1
        if (regions.length !== requiredRegionCount) malformed(`fragments.${id}.regions`, `expected ${requiredRegionCount} regions`)
        const edgeIds = regions.flatMap((region) => region.edgeIds)
        if (new Set(edgeIds).size !== edgeIds.length) malformed(`fragments.${id}.regions`, 'duplicate edge references')
    }
}

function validateTypeSpecificData(data: DiagramData) {
    if (data.meta.type !== 'entity' && data.nodes.some(({ fields }) => fields !== undefined)) {
        malformed('nodes.fields', 'value only allowed for entity diagrams')
    }
    if (data.meta.type !== 'entity' && data.edges.some(({ fromCardinality, toCardinality }) => fromCardinality || toCardinality)) {
        malformed('edges.cardinality', 'value only allowed for entity diagrams')
    }
    const edgeKinds: Record<DiagramType, DiagramEdgeKind[]> = {
        architecture: ['connection', 'data', 'async'],
        dependency: ['dependency', 'cycle'],
        entity: ['relationship'],
        flow: ['flow', 'transition'],
        sequence: ['call', 'return', 'async', 'success'],
    }
    const invalidEdge = data.edges.find(({ kind }) => !edgeKinds[data.meta.type].includes(kind))
    if (invalidEdge) malformed(`edges.${invalidEdge.id}.kind`, `unsupported value ${invalidEdge.kind} for ${data.meta.type}`)
    const defaultNodeKinds: Partial<Record<DiagramType, DiagramNodeKind>> = {architecture: 'component', dependency: 'component', entity: 'entity', sequence: 'participant'}
    const defaultNodeKind = defaultNodeKinds[data.meta.type]
    const invalidTypedNode = defaultNodeKind && data.nodes.find(({ kind }) => kind !== undefined && kind !== defaultNodeKind)
    if (invalidTypedNode) malformed(`nodes.${invalidTypedNode.id}.kind`, `unsupported value ${invalidTypedNode.kind} for ${data.meta.type}`)
    if (data.meta.type === 'flow') {
        const allowedKinds: DiagramNodeKind[] = data.meta.preset === 'state'
            ? ['start', 'end', 'state']
            : ['start', 'end', 'step', 'decision']
        const invalidNode = data.nodes.find(({ kind }) => !kind || !allowedKinds.includes(kind))
        if (invalidNode) malformed(`nodes.${invalidNode.id}.kind`, `required ${data.meta.preset} node kind`)
    }
    if (data.meta.type === 'flow' && data.meta.preset === 'flowchart') {
        const unlabeledBranch = data.edges.find(({ from, label }) => {
            const source = data.nodes.find(({ id }) => id === from)

            return source?.kind === 'decision' && !label
        })
        if (unlabeledBranch) malformed(`edges.${unlabeledBranch.id}.label`, 'required decision branch label')
    }
    if (data.meta.type === 'flow' && data.meta.preset === 'state') {
        const unlabeledTransition = data.edges.find(({ label }) => !label)
        if (unlabeledTransition) malformed(`edges.${unlabeledTransition.id}.label`, 'required state transition label')
    }
    validateSequenceFragments(data)
}

export function parseDiagramData(content: string): DiagramData {
    let parsedValue: unknown
    try {
        parsedValue = JSON.parse(content)
    } catch {
        throw new Error('Malformed diagram data: invalid JSON')
    }
    const root = requireObject(parsedValue, 'root')
    const data: DiagramData = {
        edges: requireArray(root.edges, 'edges').map(parseEdge),
        ...(root.fragments === undefined ? {} : { fragments: requireArray(root.fragments, 'fragments').map(parseSequenceFragment) }),
        groups: root.groups === undefined ? [] : requireArray(root.groups, 'groups').map(parseGroup),
        meta: parseMeta(root.meta),
        nodes: requireArray(root.nodes, 'nodes').map(parseNode),
    }
    validateReferences(data)
    validateTypeSpecificData(data)

    return data
}

export function isDiagramDataPath(path: string) {
    return path.toLowerCase().endsWith('.json')
}

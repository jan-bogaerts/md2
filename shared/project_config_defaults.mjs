export const DEFAULT_WORKING_FOLDER = 'active'
export const DEFAULT_ACTIONS_FOLDER = 'actions'
export const DEFAULT_ARCHIVED_FOLDER = 'archived'
export const DEFAULT_PROJECT_FOLDER = 'design'
export const DEFAULT_RELEASES_FOLDER = 'history'
export const DEFAULT_DIAGRAMS_FOLDER = 'diagrams'
export const DEFAULT_DIAGRAM_FOOTER = `Save exactly one valid JSON object to {{diagram-file}}. Write JSON only: no SVG, markup, Markdown code fence, or explanatory text.

Required root fields:
- meta: { version: 1, type, title, description }
- nodes: [{ id, label, role }]
- edges: [{ id, from, to, kind }]

Optional root fields:
- groups: [{ id, label, nodeIds }]
- fragments for sequence data only

Optional meta fields:
- preset, required for flow data and forbidden for other types

Supported diagram types:
- architecture
- dependency
- sequence
- flow
- entity

Supported roles:
- focal
- backend
- store
- external
- input
- optional
- boundary

Node fields:
- Required: id, label, role
- Optional: kind, sublabel, tag, drilldown, x, y, width, height
- fields: [{ name, optional type, optional key }] is allowed only for entity nodes
- Entity field key must be primary or foreign
- Omit drilldown or set it to true for selectable nodes; set it to false only for non-selectable nodes

Node kinds by diagram type:
- architecture: component
- dependency: component
- sequence: participant
- entity: entity
- flow with preset flowchart: start, end, step, decision
- flow with preset state: start, end, state

Edge kinds by diagram type:
- architecture: connection, data, async
- dependency: dependency, cycle
- sequence: call, return, async, success
- flow: flow, transition
- entity: relationship

Optional edge fields:
- label
- waypoints: [{ x, y }]
- fromCardinality and toCardinality for entity relationships only
- Cardinalities must be 1, N, 0..1, or 1..*

Flow rules:
- meta.preset must be flowchart or state
- Every edge leaving a decision node must have a label
- Every state transition must have a label

Sequence rules:
- Store message edges in chronological order
- fragments use { id, operator, regions: [{ guard, edgeIds }] }
- operator must be alt, opt, or loop
- alt requires exactly two regions
- opt and loop require exactly one region
- An edge may occur only once within a fragment

Reference rules:
- Node IDs must be unique
- Edge IDs must be unique and must not duplicate node IDs
- Every edge.from and edge.to must reference an existing node
- Every group.nodeIds entry must reference an existing node
- Every fragment edgeIds entry must reference an existing edge

Layout is owned by the application. Prefer omitting x, y, width, height, and waypoints. If supplied, all geometry values must be multiples of 4, width and height must be positive, and waypoint segments must be horizontal or vertical.
`

export function normalizeFolderPath(folderPath) {
    return folderPath.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
}

export function joinProjectFolderPath(projectFolder, folderPath) {
    const normalizedProjectFolder = normalizeFolderPath(projectFolder)
    const normalizedFolderPath = normalizeFolderPath(folderPath)

    return normalizedProjectFolder.length > 0 ? `${normalizedProjectFolder}/${normalizedFolderPath}` : normalizedFolderPath
}

export const DIAGRAM_INDEX_VERSION = 1

export interface DiagramParentReference {
    diagramId: string
    itemId: string
    itemLabel: string
}

export interface DiagramRecord {
    actionId: string
    /** ISO timestamp of the run that produced this diagram; absent in indexes written before it was recorded. */
    createdAt?: string
    id: string
    label: string
    parent?: DiagramParentReference
    path: string
    /** Source record that began an edited-copy session. */
    sourceDiagramId?: string
}

export interface DiagramIndex {
    activePath: string[]
    children: Record<string, Record<string, Record<string, string[]>>>
    diagrams: Record<string, DiagramRecord>
    roots: Record<string, string[]>
    version: typeof DIAGRAM_INDEX_VERSION
}

export function emptyDiagramIndex(): DiagramIndex {
    return { activePath: [], children: {}, diagrams: {}, roots: {}, version: DIAGRAM_INDEX_VERSION }
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed diagram index: invalid ${field}`)

    return value as Record<string, unknown>
}

function requireString(value: unknown, field: string) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Malformed diagram index: invalid ${field}`)

    return value
}

function requireStringArray(value: unknown, field: string) {
    if (!Array.isArray(value)) throw new Error(`Malformed diagram index: invalid ${field}`)

    return value.map((entry, index) => requireString(entry, `${field}[${index}]`))
}

function parseParent(value: unknown, field: string): DiagramParentReference | undefined {
    if (value === undefined) return undefined
    const parent = requireObject(value, field)

    return {
        diagramId: requireString(parent.diagramId, `${field}.diagramId`),
        itemId: requireString(parent.itemId, `${field}.itemId`),
        itemLabel: requireString(parent.itemLabel, `${field}.itemLabel`),
    }
}

function parseRecord(value: unknown, id: string): DiagramRecord {
    const record = requireObject(value, `diagrams.${id}`)
    const parsedId = requireString(record.id, `diagrams.${id}.id`)
    if (parsedId !== id) throw new Error(`Malformed diagram index: diagram key does not match ID ${id}`)

    return {
        actionId: requireString(record.actionId, `diagrams.${id}.actionId`),
        ...(record.createdAt === undefined ? {} : { createdAt: requireString(record.createdAt, `diagrams.${id}.createdAt`) }),
        id: parsedId,
        label: requireString(record.label, `diagrams.${id}.label`),
        ...(record.parent === undefined ? {} : { parent: parseParent(record.parent, `diagrams.${id}.parent`) }),
        path: requireString(record.path, `diagrams.${id}.path`),
        ...(record.sourceDiagramId === undefined
            ? {}
            : { sourceDiagramId: requireString(record.sourceDiagramId, `diagrams.${id}.sourceDiagramId`) }),
    }
}

function parseIdGroups(value: unknown, field: string) {
    const groups = requireObject(value, field)

    return Object.fromEntries(Object.entries(groups).map(([key, ids]) => [key, requireStringArray(ids, `${field}.${key}`)]))
}

function parseChildren(value: unknown) {
    const parents = requireObject(value, 'children')

    return Object.fromEntries(Object.entries(parents).map(([diagramId, itemValue]) => {
        const items = requireObject(itemValue, `children.${diagramId}`)
        const parsedItems = Object.fromEntries(Object.entries(items).map(([itemId, actionValue]) => [
            itemId,
            parseIdGroups(actionValue, `children.${diagramId}.${itemId}`),
        ]))

        return [diagramId, parsedItems]
    }))
}

function validateReferences(index: DiagramIndex) {
    const referencedIds = new Set<string>()
    for (const [actionId, ids] of Object.entries(index.roots)) {
        for (const id of ids) {
            const record = index.diagrams[id]
            if (!record || record.parent || record.actionId !== actionId) {
                throw new Error(`Malformed diagram index: invalid root diagram ${id}`)
            }
            referencedIds.add(id)
        }
    }
    for (const [parentId, items] of Object.entries(index.children)) {
        if (!index.diagrams[parentId]) throw new Error(`Malformed diagram index: missing parent diagram ${parentId}`)
        for (const [itemId, actions] of Object.entries(items)) {
            for (const [actionId, ids] of Object.entries(actions)) {
                for (const id of ids) {
                    const record = index.diagrams[id]
                    const matchesParent = record?.parent?.diagramId === parentId && record.parent.itemId === itemId
                    if (!matchesParent || record.actionId !== actionId) {
                        throw new Error(`Malformed diagram index: invalid child diagram ${id}`)
                    }
                    referencedIds.add(id)
                }
            }
        }
    }
    const unreferencedId = Object.keys(index.diagrams).find((id) => !referencedIds.has(id))
    if (unreferencedId) throw new Error(`Malformed diagram index: unreferenced diagram ${unreferencedId}`)

    index.activePath.forEach((id, indexPosition) => {
        const record = index.diagrams[id]
        if (!record) throw new Error(`Malformed diagram index: active path diagram does not exist ${id}`)
        if (indexPosition === 0 && record.parent) throw new Error('Malformed diagram index: active path must begin with a root diagram')
        if (indexPosition > 0 && record.parent?.diagramId !== index.activePath[indexPosition - 1]) {
            throw new Error(`Malformed diagram index: broken active path at ${id}`)
        }
    })
}

export function parseDiagramIndex(content: string): DiagramIndex {
    let parsedValue: unknown
    try {
        parsedValue = JSON.parse(content)
    } catch {
        throw new Error('Malformed diagram index: invalid JSON')
    }
    const parsed = requireObject(parsedValue, 'root')
    if (parsed.version !== DIAGRAM_INDEX_VERSION) {
        throw new Error(`Malformed diagram index: unsupported version ${String(parsed.version)}`)
    }
    const diagramValues = requireObject(parsed.diagrams, 'diagrams')
    const index: DiagramIndex = {
        activePath: requireStringArray(parsed.activePath, 'activePath'),
        children: parseChildren(parsed.children),
        diagrams: Object.fromEntries(Object.entries(diagramValues).map(([id, value]) => [id, parseRecord(value, id)])),
        roots: parseIdGroups(parsed.roots, 'roots'),
        version: DIAGRAM_INDEX_VERSION,
    }
    validateReferences(index)

    return index
}

export function serializeDiagramIndex(index: DiagramIndex) {
    validateReferences(index)

    return `${JSON.stringify(index, null, 2)}\n`
}

export function diagramIndexPath(diagramsFolder: string) {
    const normalizedFolder = diagramsFolder.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
    if (normalizedFolder.length === 0) throw new Error('Diagram folder is required')

    return `${normalizedFolder}/diagram-view.json`
}

export function isPathInsideDiagramsFolder(path: string, diagramsFolder: string) {
    const normalizedPath = path.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
    const normalizedFolder = diagramsFolder.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')

    return normalizedPath.startsWith(`${normalizedFolder}/`) && !normalizedPath.split('/').includes('..')
}

import type { DiagramRecord } from '../../../services/diagrams/diagram_index'

function pathSegments(path: string) {
    return path.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '').split('/').filter((segment) => segment.length > 0)
}

/** Resolves a persisted diagram path from a card created directly inside the configured working folder. */
export function cardRelativeDiagramPath(workingFolder: string, diagramPath: string) {
    const folderSegments = pathSegments(workingFolder)
    const diagramSegments = pathSegments(diagramPath)
    let sharedSegmentCount = 0
    while (
        sharedSegmentCount < folderSegments.length
        && sharedSegmentCount < diagramSegments.length
        && folderSegments[sharedSegmentCount] === diagramSegments[sharedSegmentCount]
    ) sharedSegmentCount += 1

    return [
        ...folderSegments.slice(sharedSegmentCount).map(() => '..'),
        ...diagramSegments.slice(sharedSegmentCount),
    ].join('/')
}

/** Builds initial implementation Markdown without replacing later user edits. */
export function diagramImplementationInstructions(
    title: string,
    generatedChanges: string,
    sourceRecord: DiagramRecord,
    savedRecord: DiagramRecord | null,
    workingFolder: string,
) {
    const sections: string[] = []
    if (sourceRecord.pendingImplementation && !sourceRecord.parent) {
        const diagramRecord = savedRecord?.sourceDiagramId === sourceRecord.id ? savedRecord : sourceRecord
        const relativePath = cardRelativeDiagramPath(workingFolder, diagramRecord.path)
        sections.push(`Implement diagram [${title}](<${relativePath}>).`)
    }
    if (generatedChanges.trim().length > 0) sections.push(generatedChanges)

    return sections.join('\n\n')
}

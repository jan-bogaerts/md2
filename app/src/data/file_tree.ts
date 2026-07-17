import { groupByStatus, UNASSIGNED_STATUS } from './card_ordering'
import type { ActionDefinition } from './action_types'
import type { ProjectCard } from './data_types'

/** The kinds of node the text-view tree can contain. */
export type TreeNodeKind = 'status' | 'folder' | 'special' | 'file'

/** A single node in the text-view tree. `path` is set only on file leaves. */
export interface TreeNode {
    children: TreeNode[]
    directoryPath: string
    id: string
    kind: TreeNodeKind
    label: string
    path: string | null
}

export interface FileTreeOptions {
    actions: ActionDefinition[]
    hiddenFolderPaths: string[]
    projectFolder: string
    repositoryFiles: string[]
    specialFolderPaths: string[]
}

const UNASSIGNED_STATUS_LABEL = 'Unassigned'
const DEFAULT_IMPORTED_ID = 'F-0'
const UNTITLED_TITLE = 'Untitled'

function getFileName(path: string) {
    return path.replace(/\\/g, '/').split('/').at(-1) ?? path
}

/** Human label for a file leaf: `id title` when meaningful, otherwise the file name. */
export function fileLabel(card: ProjectCard): string {
    const { id, title } = card.header
    const hasTitle = title.length > 0 && title !== UNTITLED_TITLE

    if (hasTitle) return id && id !== DEFAULT_IMPORTED_ID ? `${id} ${title}` : title

    return getFileName(card.path)
}

/** Find or create a folder child under `parent`, returning the child node. */
function ensureFolder(parent: TreeNode, segment: string, specialFolderPaths: Set<string>): TreeNode {
    const existing = parent.children.find((child) => child.kind !== 'file' && child.label === segment)
    if (existing) return existing

    const directoryPath = parent.directoryPath.length > 0 ? `${parent.directoryPath}/${segment}` : segment
    const folder: TreeNode = {
        children: [],
        directoryPath,
        id: `${parent.id}/${segment}`,
        kind: specialFolderPaths.has(directoryPath) ? 'special' : 'folder',
        label: segment,
        path: null,
    }
    parent.children.push(folder)

    return folder
}

/** Build the status-group roots from the active (root working-folder) cards. */
function buildStatusGroups(activeCards: ProjectCard[], projectFolder: string): TreeNode[] {
    return groupByStatus(activeCards).map((column) => ({
        children: column.cards.map((card) => ({
            children: [],
            directoryPath: projectFolder,
            id: card.path,
            kind: 'file' as const,
            label: fileLabel(card),
            path: card.path,
        })),
        directoryPath: projectFolder,
        id: `status:${column.status}`,
        kind: 'status' as const,
        label: column.status === UNASSIGNED_STATUS ? UNASSIGNED_STATUS_LABEL : column.status,
        path: null,
    }))
}

/**
 * Build the folder roots from the background cards (subfolder and special-folder
 * files). The first path segment names a top-level folder; when it matches a
 * configured special-folder name the node is marked `special`.
 */
function relativeSegmentsInside(path: string, parentFolder: string): string[] {
    const normalized = path.replace(/\\/g, '/')
    const normalizedParent = parentFolder.replace(/\\/g, '/').replace(/\/$/u, '')
    if (normalizedParent.length === 0) return normalized.split('/').filter((segment) => segment.length > 0)

    const prefix = `${normalizedParent}/`
    if (!normalized.startsWith(prefix)) return []

    const segments = normalized.slice(prefix.length).split('/').filter((segment) => segment.length > 0)

    return segments
}

function ensureFolderSegments(root: TreeNode, segments: string[], specialFolderPaths: Set<string>) {
    let parent = root
    for (const segment of segments) parent = ensureFolder(parent, segment, specialFolderPaths)

    return parent
}

function isHiddenPath(path: string, hiddenFolderPaths: Set<string>) {
    const normalizedPath = path.replace(/\\/gu, '/').replace(/\/+$/u, '')

    return [...hiddenFolderPaths].some((hiddenFolderPath) => (
        normalizedPath === hiddenFolderPath || normalizedPath.startsWith(`${hiddenFolderPath}/`)
    ))
}

function buildFolderRoots(
    actions: ActionDefinition[],
    backgroundCards: ProjectCard[],
    projectFolder: string,
    repositoryFiles: string[],
    hiddenFolderPaths: Set<string>,
    specialFolderPaths: Set<string>,
): TreeNode {
    const root: TreeNode = { children: [], directoryPath: projectFolder, id: 'root', kind: 'folder', label: '', path: null }

    for (const repositoryFile of repositoryFiles) {
        if (isHiddenPath(repositoryFile, hiddenFolderPaths)) continue
        const segments = relativeSegmentsInside(repositoryFile, projectFolder)
        ensureFolderSegments(root, segments.slice(0, -1), specialFolderPaths)
    }

    for (const card of backgroundCards) {
        if (isHiddenPath(card.path, hiddenFolderPaths)) continue
        const segments = relativeSegmentsInside(card.path, projectFolder)
        if (segments.length === 0) continue

        const parent = ensureFolderSegments(root, segments.slice(0, -1), specialFolderPaths)

        parent.children.push({
            children: [],
            directoryPath: parent.directoryPath,
            id: card.path,
            kind: 'file',
            label: fileLabel(card),
            path: card.path,
        })
    }

    for (const action of actions) {
        if (!action.sourcePath || action.builtin) continue
        if (isHiddenPath(action.sourcePath, hiddenFolderPaths)) continue
        const segments = relativeSegmentsInside(action.sourcePath, projectFolder)
        if (segments.length === 0) continue
        const parent = ensureFolderSegments(root, segments.slice(0, -1), specialFolderPaths)
        parent.children.push({
            children: [], directoryPath: parent.directoryPath, id: action.sourcePath,
            kind: 'file', label: action.label, path: action.sourcePath,
        })
    }

    return root
}

/**
 * Build the text-view tree: status groups for the active root cards first, then
 * the real/special folder tree derived from the background cards.
 */
export function buildFileTree(
    activeCards: ProjectCard[],
    backgroundCards: ProjectCard[],
    workingFolder: string,
    options: FileTreeOptions,
): TreeNode[] {
    const { actions, hiddenFolderPaths, projectFolder, repositoryFiles, specialFolderPaths } = options
    const hiddenPathSet = new Set(hiddenFolderPaths)
    const specialPathSet = new Set(specialFolderPaths)
    const root = buildFolderRoots(actions, backgroundCards, projectFolder, repositoryFiles, hiddenPathSet, specialPathSet)
    const statusGroups = buildStatusGroups(activeCards, projectFolder)
    if (workingFolder === projectFolder) return [...statusGroups, ...root.children]

    const workingFolderSegments = relativeSegmentsInside(workingFolder, projectFolder)
    if (workingFolderSegments.length === 0) throw new Error(`Working folder is outside the project folder: ${workingFolder}`)

    const workingFolderNode = ensureFolderSegments(root, workingFolderSegments, specialPathSet)
    workingFolderNode.children.unshift(...statusGroups)

    return root.children
}

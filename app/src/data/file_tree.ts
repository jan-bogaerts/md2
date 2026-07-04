import { groupByStatus, UNASSIGNED_STATUS } from './card_ordering'
import type { ProjectCard } from './data_types'

/** The kinds of node the text-view tree can contain. */
export type TreeNodeKind = 'status' | 'folder' | 'special' | 'file'

/** A single node in the text-view tree. `path` is set only on file leaves. */
export interface TreeNode {
    children: TreeNode[]
    id: string
    kind: TreeNodeKind
    label: string
    path: string | null
}

export interface FileTreeOptions {
    specialFolders?: string[]
}

/** Default special-folder names, recognized inside the working folder (see F-003). */
export const DEFAULT_SPECIAL_FOLDERS = ['history', 'architecture', 'prompts']

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

/** Strip the working-folder prefix and normalize separators to `/`. */
function relativeSegments(path: string, workingFolder: string): string[] {
    const normalized = path.replace(/\\/g, '/')
    const prefix = `${workingFolder}/`
    const remaining = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized

    return remaining.split('/').filter((segment) => segment.length > 0)
}

/** Find or create a folder child under `parent`, returning the child node. */
function ensureFolder(parent: TreeNode, segment: string, isSpecial: boolean): TreeNode {
    const existing = parent.children.find((child) => child.kind !== 'file' && child.label === segment)
    if (existing) return existing

    const folder: TreeNode = {
        children: [],
        id: `${parent.id}/${segment}`,
        kind: isSpecial ? 'special' : 'folder',
        label: segment,
        path: null,
    }
    parent.children.push(folder)

    return folder
}

/** Build the status-group roots from the active (root working-folder) cards. */
function buildStatusGroups(activeCards: ProjectCard[]): TreeNode[] {
    return groupByStatus(activeCards).map((column) => ({
        children: column.cards.map((card) => ({
            children: [],
            id: card.path,
            kind: 'file' as const,
            label: fileLabel(card),
            path: card.path,
        })),
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
function buildFolderRoots(backgroundCards: ProjectCard[], workingFolder: string, specialFolders: string[]): TreeNode[] {
    const root: TreeNode = { children: [], id: 'root', kind: 'folder', label: '', path: null }

    for (const card of backgroundCards) {
        const segments = relativeSegments(card.path, workingFolder)
        if (segments.length === 0) continue

        let parent = root
        for (let index = 0; index < segments.length - 1; index += 1) {
            const isSpecial = index === 0 && specialFolders.includes(segments[index])
            parent = ensureFolder(parent, segments[index], isSpecial)
        }

        parent.children.push({
            children: [],
            id: card.path,
            kind: 'file',
            label: fileLabel(card),
            path: card.path,
        })
    }

    return root.children
}

/**
 * Build the text-view tree: status groups for the active root cards first, then
 * the real/special folder tree derived from the background cards.
 */
export function buildFileTree(
    activeCards: ProjectCard[],
    backgroundCards: ProjectCard[],
    workingFolder: string,
    options: FileTreeOptions = {},
): TreeNode[] {
    const specialFolders = options.specialFolders ?? DEFAULT_SPECIAL_FOLDERS

    return [
        ...buildStatusGroups(activeCards),
        ...buildFolderRoots(backgroundCards, workingFolder, specialFolders),
    ]
}

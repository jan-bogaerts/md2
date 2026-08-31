import { getElectronActionBridge } from '../../../data/electron_action_bridge'
import { actionService } from '../../../services/actions/action_service'
import { dataService } from '../../../services/data/data_service'
import { workspaceNavigationService } from '../../../services/project/workspace_navigation_service'
import { workspaceViewService } from '../../../services/project/workspace_view_service'
import { worktreeService } from '../../../services/project/worktree_service'
import type { ProjectSnapshot, WorktreeRecord } from '../../../data/data_types'

const ABSOLUTE_WINDOWS_PATH_PATTERN = /^[a-z]:\//iu
const ENCODED_ABSOLUTE_WINDOWS_PATH_PATTERN = /^[a-z]:(?:%2f|%5c)/iu
const FILE_URL_PATTERN = /^file:\/+/iu
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/iu

function stripWindowsDriveLeadingSlash(path: string) {
    return path.startsWith('/') && ABSOLUTE_WINDOWS_PATH_PATTERN.test(path.slice(1)) ? path.slice(1) : path
}

function decodeLinkPath(href: string) {
    try {
        return decodeURIComponent(href)
    } catch {
        throw new Error(`Invalid local file link: ${href}`)
    }
}

function normalizePathSegments(path: string, allowDrive: boolean) {
    const normalizedPath = path.replace(/\\/gu, '/')
    const drive = allowDrive && ABSOLUTE_WINDOWS_PATH_PATTERN.test(normalizedPath)
        ? normalizedPath.slice(0, 2)
        : ''
    const pathWithoutDrive = drive ? normalizedPath.slice(2) : normalizedPath
    const segments: string[] = []
    for (const segment of pathWithoutDrive.split('/')) {
        if (!segment || segment === '.') continue
        if (segment === '..') {
            if (segments.length === 0) throw new Error('Local file link points outside the active repository')
            segments.pop()
            continue
        }
        segments.push(segment)
    }

    return drive ? `${drive}/${segments.join('/')}` : segments.join('/')
}

function fileUrlPath(href: string) {
    if (!FILE_URL_PATTERN.test(href)) return stripWindowsDriveLeadingSlash(href)

    const path = href.replace(FILE_URL_PATTERN, '')

    return stripWindowsDriveLeadingSlash(path)
}

function isPathInsideFolder(path: string, folder: string) {
    if (!folder) return true

    return path.toLowerCase().startsWith(`${folder.toLowerCase()}/`)
}

function stripNumericLineSuffix(path: string) {
    const match = /:(\d+)$/u.exec(path)
    if (!match || Number(match[1]) < 1) return path

    return path.slice(0, -match[0].length)
}

/** Select current repository folder for a conversation when its link is clicked. */
export function resolveConversationRepositoryRoot(
    cardInternalId: string | null,
    primaryRepositoryRoot: string,
    snapshot: ProjectSnapshot,
    worktrees: readonly WorktreeRecord[],
) {
    if (!primaryRepositoryRoot) throw new Error('Cannot open a local file link without an active repository path')
    if (!cardInternalId) return primaryRepositoryRoot

    const cards = [...snapshot.activeCards, ...snapshot.backgroundCards]
    const card = cards.find(({ header }) => header.internalId === cardInternalId)
    const worktree = card?.header.worktree
    if (worktree === null || worktree === undefined) return primaryRepositoryRoot
    if (!Number.isInteger(worktree) || worktree < 1) throw new Error(`Card has invalid worktree assignment: ${String(worktree)}`)

    const record = worktrees[worktree - 1]
    if (!record) throw new Error(`Assigned worktree ${worktree} does not exist`)
    if (!record.valid) throw new Error(`Assigned worktree ${worktree} is invalid: ${record.error ?? 'unknown error'}`)
    if (!record.path) throw new Error(`Assigned worktree ${worktree} has no folder path`)

    return record.path
}

/** True when a Markdown href represents a repository file rather than normal browser navigation. */
export function isLocalFileLink(href: string) {
    const normalizedHref = stripWindowsDriveLeadingSlash(href.trim().replace(/\\/gu, '/'))
    if (!normalizedHref || normalizedHref.startsWith('#') || normalizedHref.startsWith('/') || normalizedHref.startsWith('//')) return false
    if (
        ABSOLUTE_WINDOWS_PATH_PATTERN.test(normalizedHref)
        || ENCODED_ABSOLUTE_WINDOWS_PATH_PATTERN.test(normalizedHref)
        || FILE_URL_PATTERN.test(normalizedHref)
    ) return true

    return !URL_SCHEME_PATTERN.test(normalizedHref)
}

/** Resolve an internally loaded chat link to its canonical repository-relative path. */
export function resolveActionConversationLinkPath(href: string, repositoryRoot: string, repositoryFiles: readonly string[]) {
    if (!repositoryRoot) return null

    const decodedPath = stripNumericLineSuffix(fileUrlPath(decodeLinkPath(href.trim()))).replace(/\\/gu, '/')
    let normalizedRoot: string
    let normalizedTarget: string
    try {
        normalizedRoot = normalizePathSegments(repositoryRoot, true).replace(/\/+$/u, '')
        normalizedTarget = normalizePathSegments(decodedPath, true)
    } catch {
        return null
    }
    let relativePath = normalizedTarget
    if (ABSOLUTE_WINDOWS_PATH_PATTERN.test(normalizedTarget)) {
        const normalizedRootLower = normalizedRoot.toLowerCase()
        const normalizedTargetLower = normalizedTarget.toLowerCase()
        if (!normalizedTargetLower.startsWith(`${normalizedRootLower}/`)) return null
        relativePath = normalizedTarget.slice(normalizedRoot.length + 1)
    }
    const canonicalPath = repositoryFiles.find((candidate) => (
        normalizePathSegments(candidate, false).toLowerCase() === relativePath.toLowerCase()
    ))
    if (!canonicalPath) return null

    return canonicalPath.replace(/\\/gu, '/')
}

/** Open local chat link in internal project editor or configured external editor. */
export async function openActionConversationLink(href: string, cardInternalId: string | null) {
    const { project, snapshot } = dataService.getState()
    if (!project || !snapshot) throw new Error('Cannot open a local file link before a project is loaded')

    const repositoryRoot = resolveConversationRepositoryRoot(
        cardInternalId,
        project.rootPath ?? '',
        snapshot,
        worktreeService.getRecords(),
    )
    const repositoryPath = resolveActionConversationLinkPath(href, repositoryRoot, snapshot.repositoryFiles)
    const projectFolder = normalizePathSegments(dataService.getConfig()?.projectFolder ?? '', false)
    const isProjectMarkdown = repositoryPath !== null
        && isPathInsideFolder(repositoryPath, projectFolder)
        && repositoryPath.toLowerCase().endsWith('.md')
    const isLoadedProjectAction = repositoryPath !== null
        && isPathInsideFolder(repositoryPath, projectFolder)
        && actionService.getActionByPath(repositoryPath) !== null
    if (isProjectMarkdown || isLoadedProjectAction) {
        workspaceViewService.setViewMode('text')
        workspaceNavigationService.open(repositoryPath)
        return
    }

    const bridge = getElectronActionBridge()
    if (!bridge) throw new Error('Opening local project files requires Electron local mode')

    await bridge.openInEditor({ path: stripWindowsDriveLeadingSlash(href), repositoryRoot })
}

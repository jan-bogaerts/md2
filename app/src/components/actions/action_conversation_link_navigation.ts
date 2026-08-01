import { getElectronActionBridge } from '../../data/electron_action_bridge'
import { actionService } from '../../services/actions/action_service'
import { dataService } from '../../services/data/data_service'
import { workspaceNavigationService } from '../../services/project/workspace_navigation_service'
import { workspaceViewService } from '../../services/project/workspace_view_service'

const ABSOLUTE_WINDOWS_PATH_PATTERN = /^[a-z]:\//iu
const ENCODED_ABSOLUTE_WINDOWS_PATH_PATTERN = /^[a-z]:(?:%2f|%5c)/iu
const FILE_URL_PATTERN = /^file:\/+/iu
const URL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/iu

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
    if (!FILE_URL_PATTERN.test(href)) return href

    const path = href.replace(FILE_URL_PATTERN, '')

    return path.startsWith('/') && ABSOLUTE_WINDOWS_PATH_PATTERN.test(path.slice(1)) ? path.slice(1) : path
}

function isPathInsideFolder(path: string, folder: string) {
    if (!folder) return true

    return path.toLowerCase().startsWith(`${folder.toLowerCase()}/`)
}

/** True when a Markdown href represents a repository file rather than normal browser navigation. */
export function isLocalFileLink(href: string) {
    const normalizedHref = href.trim().replace(/\\/gu, '/')
    if (!normalizedHref || normalizedHref.startsWith('#') || normalizedHref.startsWith('/') || normalizedHref.startsWith('//')) return false
    if (
        ABSOLUTE_WINDOWS_PATH_PATTERN.test(normalizedHref)
        || ENCODED_ABSOLUTE_WINDOWS_PATH_PATTERN.test(normalizedHref)
        || FILE_URL_PATTERN.test(normalizedHref)
    ) return true

    return !URL_SCHEME_PATTERN.test(normalizedHref)
}

/** Resolve a chat link to the canonical repository-relative path from the loaded file index. */
export function resolveActionConversationLinkPath(href: string, repositoryRoot: string, repositoryFiles: readonly string[]) {
    if (!repositoryRoot) throw new Error('Cannot open a local file link without an active repository path')

    const decodedPath = fileUrlPath(decodeLinkPath(href.trim())).replace(/\\/gu, '/')
    const normalizedRoot = normalizePathSegments(repositoryRoot, true).replace(/\/+$/u, '')
    const normalizedTarget = normalizePathSegments(decodedPath, true)
    let relativePath = normalizedTarget
    if (ABSOLUTE_WINDOWS_PATH_PATTERN.test(normalizedTarget)) {
        const normalizedRootLower = normalizedRoot.toLowerCase()
        const normalizedTargetLower = normalizedTarget.toLowerCase()
        if (!normalizedTargetLower.startsWith(`${normalizedRootLower}/`)) {
            throw new Error('Local file link points outside the active repository')
        }
        relativePath = normalizedTarget.slice(normalizedRoot.length + 1)
    }
    const canonicalPath = repositoryFiles.find((candidate) => (
        normalizePathSegments(candidate, false).toLowerCase() === relativePath.toLowerCase()
    ))
    if (!canonicalPath) throw new Error(`Local file link target does not exist: ${relativePath}`)

    return canonicalPath.replace(/\\/gu, '/')
}

/** Open one validated local chat link in the internal list editor or VS Code. */
export async function openActionConversationLink(href: string) {
    const { project, snapshot } = dataService.getState()
    if (!project || !snapshot) throw new Error('Cannot open a local file link before a project is loaded')

    const repositoryPath = resolveActionConversationLinkPath(href, project.rootPath ?? '', snapshot.repositoryFiles)
    const projectFolder = normalizePathSegments(dataService.getConfig()?.projectFolder ?? '', false)
    const isProjectMarkdown = isPathInsideFolder(repositoryPath, projectFolder) && repositoryPath.toLowerCase().endsWith('.md')
    const isLoadedProjectAction = isPathInsideFolder(repositoryPath, projectFolder)
        && actionService.getActionByPath(repositoryPath) !== null
    if (isProjectMarkdown || isLoadedProjectAction) {
        workspaceViewService.setViewMode('text')
        workspaceNavigationService.open(repositoryPath)
        return
    }

    const bridge = getElectronActionBridge()
    if (!bridge) throw new Error('Opening local project files in VS Code requires Electron local mode')

    await bridge.openInEditor({ line: 1, path: repositoryPath })
}

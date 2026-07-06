import type { MarkdownFile, MoveFile, ProjectCard } from './data_types'

const HISTORY_FOLDER = 'history'
const RELEASE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u

function normalizePath(path: string) {
    return path.replace(/\\/gu, '/')
}

function releaseFolderPath(workingFolder: string, releaseName: string) {
    return `${workingFolder}/${HISTORY_FOLDER}/${releaseName}`
}

export function validateReleaseName(releaseName: string) {
    const trimmedName = releaseName.trim()

    if (trimmedName.length === 0) throw new Error('Release name is required')
    if (!RELEASE_NAME_PATTERN.test(trimmedName)) {
        throw new Error('Release name may contain only letters, numbers, dots, underscores and hyphens')
    }
    if (trimmedName === '.' || trimmedName === '..') throw new Error('Release name must be a safe folder name')

    return trimmedName
}

export function buildReleaseMoves(
    files: MarkdownFile[],
    activeCards: ProjectCard[],
    workingFolder: string,
    releaseName: string,
    repositoryFiles: string[] = [],
): MoveFile[] {
    const safeReleaseName = validateReleaseName(releaseName)
    const targetFolder = releaseFolderPath(workingFolder, safeReleaseName)
    const normalizedTargetFolder = `${targetFolder}/`
    const existingPaths = new Set([
        ...files.map((file) => normalizePath(file.path)),
        ...repositoryFiles.map(normalizePath),
    ])
    const filesByPath = new Map(files.map((file) => [normalizePath(file.path), file]))
    const hasExistingReleaseFolder = [...existingPaths].some((path) => path.startsWith(normalizedTargetFolder))

    if (hasExistingReleaseFolder) throw new Error(`Release already exists: ${safeReleaseName}`)

    return activeCards.map((card) => {
        const sourcePath = normalizePath(card.path)
        const fileName = sourcePath.split('/').at(-1)
        if (!fileName) throw new Error(`Cannot archive card without a file name: ${card.path}`)

        const toPath = `${targetFolder}/${fileName}`
        if (existingPaths.has(toPath)) throw new Error(`Release archive target already exists: ${toPath}`)
        const file = filesByPath.get(sourcePath)
        if (!file) throw new Error(`Cannot archive unloaded card file: ${card.path}`)

        return {
            content: file.content,
            fromPath: card.path,
            sha: file.sha,
            toPath,
        }
    })
}

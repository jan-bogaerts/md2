import type { MarkdownFile, MoveFile, ProjectCard } from './data_types'
import { isSafeAssetFileName, isSupportedAssetFileName, resolveCardAssetPath } from './asset_paths'

const HISTORY_FOLDER = 'history'
const RELEASE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u
const MARKDOWN_EXTENSION = '.md'
const MARKDOWN_IMAGE_LINK_PATTERN = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/gu

function normalizePath(path: string) {
    return path.replace(/\\/gu, '/')
}

function releaseFolderPath(workingFolder: string, releaseName: string) {
    return `${workingFolder}/${HISTORY_FOLDER}/${releaseName}`
}

function isMarkdownFile(path: string) {
    return path.toLowerCase().endsWith(MARKDOWN_EXTENSION)
}

function isExternalAssetReference(reference: string) {
    return /^[a-z][a-z0-9+.-]*:/iu.test(reference) || reference.startsWith('#')
}

function cleanAssetReference(reference: string) {
    return reference.replace(/^<|>$/gu, '').trim()
}

function referencedCardAssets(file: MarkdownFile) {
    const assets: string[] = []

    for (const match of file.content.matchAll(MARKDOWN_IMAGE_LINK_PATTERN)) {
        const reference = cleanAssetReference(match[1])
        if (reference.length === 0 || isExternalAssetReference(reference)) continue
        if (!isSafeAssetFileName(reference) || !isSupportedAssetFileName(reference)) continue

        assets.push(resolveCardAssetPath(file.path, reference))
    }

    return assets
}

function targetPathForSource(targetFolder: string, sourcePath: string) {
    const fileName = sourcePath.split('/').at(-1)
    if (!fileName) throw new Error(`Cannot archive file without a file name: ${sourcePath}`)

    return `${targetFolder}/${fileName}`
}

function createMove(file: MarkdownFile, fromPath: string, toPath: string, encoding = file.encoding): MoveFile {
    const move = {
        content: file.content,
        fromPath,
        sha: file.sha,
        toPath,
    }
    if (encoding) return { ...move, encoding }

    return move
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

export function findReleaseAssetPaths(files: MarkdownFile[], activeCards: ProjectCard[]) {
    const activeSourcePaths = new Set(activeCards.map((card) => normalizePath(card.path)))
    const nonArchivedAssetPaths = new Set(
        files
            .filter((file) => isMarkdownFile(file.path) && !activeSourcePaths.has(normalizePath(file.path)))
            .flatMap(referencedCardAssets)
            .map(normalizePath),
    )
    const assetPaths: string[] = []
    const plannedAssetPaths = new Set<string>()

    for (const card of activeCards) {
        const file = files.find((candidate) => normalizePath(candidate.path) === normalizePath(card.path))
        if (!file) continue

        for (const assetPath of referencedCardAssets(file).map(normalizePath)) {
            if (nonArchivedAssetPaths.has(assetPath) || plannedAssetPaths.has(assetPath)) continue

            plannedAssetPaths.add(assetPath)
            assetPaths.push(assetPath)
        }
    }

    return assetPaths
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
    const releaseAssetPaths = new Set(findReleaseAssetPaths(files, activeCards))
    const moveTargetPaths = new Set<string>()
    const hasExistingReleaseFolder = [...existingPaths].some((path) => path.startsWith(normalizedTargetFolder))

    if (hasExistingReleaseFolder) throw new Error(`Release already exists: ${safeReleaseName}`)

    const moves: MoveFile[] = []

    for (const card of activeCards) {
        const sourcePath = normalizePath(card.path)
        const toPath = targetPathForSource(targetFolder, sourcePath)

        if (existingPaths.has(toPath) || moveTargetPaths.has(toPath)) throw new Error(`Release archive target already exists: ${toPath}`)
        const file = filesByPath.get(sourcePath)
        if (!file) throw new Error(`Cannot archive unloaded card file: ${card.path}`)

        moveTargetPaths.add(toPath)
        moves.push(createMove(file, card.path, toPath))

        for (const assetPath of referencedCardAssets(file).map(normalizePath)) {
            if (!releaseAssetPaths.has(assetPath)) continue

            const assetTargetPath = targetPathForSource(targetFolder, assetPath)
            if (existingPaths.has(assetTargetPath) || moveTargetPaths.has(assetTargetPath)) {
                throw new Error(`Release archive target already exists: ${assetTargetPath}`)
            }

            const assetFile = filesByPath.get(assetPath)
            if (!assetFile) throw new Error(`Cannot archive unloaded card asset: ${assetPath}`)

            moveTargetPaths.add(assetTargetPath)
            moves.push(createMove(assetFile, assetPath, assetTargetPath, 'base64'))
            releaseAssetPaths.delete(assetPath)
        }
    }

    return moves
}

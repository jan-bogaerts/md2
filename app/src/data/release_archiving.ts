import type { MarkdownFile, MoveFile, ProjectCard } from './data_types'
import { isSafeAssetFileName, isSupportedAssetFileName, resolveCardAssetPath } from './asset_paths'
import { markdownParsingService } from '../services/data/markdown_parsing_service'
import { parseActivityFile } from '../../../shared/card_activity.mjs'
import {
    activityFilePath,
    cardActivityFileName,
    conversationActivityReference,
    parseConversationActivityReference,
} from '../../../shared/activity_paths.mjs'
import { normalizePath } from '../../../shared/path_utils.mjs'

const RELEASE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u
const MARKDOWN_EXTENSION = '.md'
const MARKDOWN_IMAGE_LINK_PATTERN = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/gu

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

function releaseActivitySource(card: ProjectCard, projectFolder: string) {
    const cardInternalId = card.header.internalId
    if (!cardInternalId) throw new Error(`Cannot release a card without an internal ID: ${card.path}`)

    const sourcePath = activityFilePath(projectFolder, { cardInternalId, kind: 'card' })
    const conversationIds = card.header.agentLogReferences.map((reference) => {
        const parsed = parseConversationActivityReference(reference)
        if (normalizePath(parsed.activityPath) !== normalizePath(sourcePath)) {
            throw new Error(`Unexpected activity path for released card ${card.path}: ${parsed.activityPath}`)
        }

        return parsed.conversationId
    })

    return { cardInternalId, conversationIds, sourcePath }
}

export function findReleaseActivityPaths(
    releaseCards: ProjectCard[],
    projectFolder: string,
    repositoryFiles: string[],
) {
    const repositoryPaths = new Set(repositoryFiles.map(normalizePath))
    const activityPaths = new Set<string>()

    for (const card of releaseCards) {
        const { conversationIds, sourcePath } = releaseActivitySource(card, projectFolder)
        const normalizedSourcePath = normalizePath(sourcePath)
        const exists = repositoryPaths.has(normalizedSourcePath)
        if (conversationIds.length > 0 && !exists) throw new Error(`Missing referenced activity log: ${sourcePath}`)
        if (exists) activityPaths.add(sourcePath)
    }

    return [...activityPaths]
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

export function findArchiveAssetPaths(files: MarkdownFile[], archivedCards: ProjectCard[]) {
    const archivedSourcePaths = new Set(archivedCards.map((card) => normalizePath(card.path)))
    const nonArchivedAssetPaths = new Set(
        files
            .filter((file) => isMarkdownFile(file.path) && !archivedSourcePaths.has(normalizePath(file.path)))
            .flatMap(referencedCardAssets)
            .map(normalizePath),
    )
    const assetPaths: string[] = []
    const plannedAssetPaths = new Set<string>()

    for (const card of archivedCards) {
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
    projectFolder: string,
    releasesFolder: string,
    safeReleaseName: string,
    repositoryFiles: string[] = [],
    activityFiles: MarkdownFile[] = [],
): MoveFile[] {
    const normalizedProjectFolder = normalizePath(projectFolder).replace(/\/+$/u, '')
    const normalizedReleasesFolder = normalizePath(releasesFolder).replace(/\/+$/u, '')
    const projectPrefix = normalizedProjectFolder.length > 0 ? `${normalizedProjectFolder}/` : ''
    if (
        normalizedReleasesFolder !== normalizedProjectFolder
        && !normalizedReleasesFolder.startsWith(projectPrefix)
    ) {
        throw new Error(`Releases folder must stay inside the project folder: ${releasesFolder}`)
    }

    const targetFolder = `${normalizedReleasesFolder}/${safeReleaseName}`
    const normalizedTargetFolder = `${targetFolder}/`
    const existingPaths = new Set([
        ...files.map((file) => normalizePath(file.path)),
        ...repositoryFiles.map(normalizePath),
    ])
    const hasExistingReleaseFolder = [...existingPaths].some((path) => path.startsWith(normalizedTargetFolder))

    if (hasExistingReleaseFolder) throw new Error(`Release already exists: ${safeReleaseName}`)

    const moves = buildCardArchiveMoves(files, activeCards, targetFolder, repositoryFiles)
    const repositoryPaths = new Set(repositoryFiles.map(normalizePath))
    const activityFilesByPath = new Map(activityFiles.map((file) => [normalizePath(file.path), file]))
    const targetPaths = new Set(moves.map((move) => normalizePath(move.toPath)))
    const cardActivityMoves = new Map<string, MoveFile>()
    const rewrittenCardContentByPath = new Map<string, string>()

    for (const card of activeCards) {
        const { cardInternalId, conversationIds, sourcePath } = releaseActivitySource(card, projectFolder)
        const normalizedSourcePath = normalizePath(sourcePath)
        const activityExists = repositoryPaths.has(normalizedSourcePath)
        if (conversationIds.length > 0 && !activityExists) throw new Error(`Missing referenced activity log: ${sourcePath}`)
        if (!activityExists) continue

        const activityFile = activityFilesByPath.get(normalizedSourcePath)
        if (!activityFile) throw new Error(`Cannot release unloaded activity log: ${sourcePath}`)
        const activity = parseActivityFile(activityFile.content)
        if (activity.origin.kind !== 'card' || activity.origin.cardInternalId !== cardInternalId) {
            throw new Error(`Activity log does not belong to released card ${card.path}: ${sourcePath}`)
        }
        for (const conversationId of conversationIds) {
            if (!activity.conversations.some((conversation) => conversation.id === conversationId)) {
                throw new Error(`Referenced conversation is missing from activity log ${sourcePath}: ${conversationId}`)
            }
        }

        const activityTargetPath = `${targetFolder}/${cardActivityFileName(cardInternalId)}`
        const normalizedActivityTargetPath = normalizePath(activityTargetPath)
        if (existingPaths.has(normalizedActivityTargetPath) || targetPaths.has(normalizedActivityTargetPath)) {
            throw new Error(`Archive target already exists: ${activityTargetPath}`)
        }

        targetPaths.add(normalizedActivityTargetPath)
        cardActivityMoves.set(normalizePath(card.path), createMove(activityFile, sourcePath, activityTargetPath))

        if (conversationIds.length === 0) continue
        const references = conversationIds.map((conversationId) => (
            conversationActivityReference(activityTargetPath, conversationId)
        ))
        const cardMove = moves.find((move) => normalizePath(move.fromPath) === normalizePath(card.path))
        if (!cardMove) throw new Error(`Cannot find release move for card: ${card.path}`)
        rewrittenCardContentByPath.set(
            normalizePath(card.path),
            markdownParsingService.setAgentLogReferences(cardMove.content, references),
        )
    }

    return moves.flatMap((move) => {
        const activityMove = cardActivityMoves.get(normalizePath(move.fromPath))
        const rewrittenContent = rewrittenCardContentByPath.get(normalizePath(move.fromPath))
        const preparedMove = rewrittenContent === undefined ? move : { ...move, content: rewrittenContent }

        return activityMove ? [preparedMove, activityMove] : [preparedMove]
    })
}

export function buildCardArchiveMoves(
    files: MarkdownFile[],
    archivedCards: ProjectCard[],
    targetFolder: string,
    repositoryFiles: string[] = [],
): MoveFile[] {
    const existingPaths = new Set([
        ...files.map((file) => normalizePath(file.path)),
        ...repositoryFiles.map(normalizePath),
    ])
    const filesByPath = new Map(files.map((file) => [normalizePath(file.path), file]))
    const archiveAssetPaths = new Set(findArchiveAssetPaths(files, archivedCards))
    const moveTargetPaths = new Set<string>()
    const moves: MoveFile[] = []

    for (const card of archivedCards) {
        const sourcePath = normalizePath(card.path)
        const toPath = targetPathForSource(targetFolder, sourcePath)

        if (existingPaths.has(toPath) || moveTargetPaths.has(toPath)) throw new Error(`Archive target already exists: ${toPath}`)
        const file = filesByPath.get(sourcePath)
        if (!file) throw new Error(`Cannot archive unloaded card file: ${card.path}`)

        moveTargetPaths.add(toPath)
        moves.push(createMove(file, card.path, toPath))

        for (const assetPath of referencedCardAssets(file).map(normalizePath)) {
            if (!archiveAssetPaths.has(assetPath)) continue

            const assetTargetPath = targetPathForSource(targetFolder, assetPath)
            if (existingPaths.has(assetTargetPath) || moveTargetPaths.has(assetTargetPath)) {
                throw new Error(`Archive target already exists: ${assetTargetPath}`)
            }

            const assetFile = filesByPath.get(assetPath)
            if (!assetFile) throw new Error(`Cannot archive unloaded card asset: ${assetPath}`)

            moveTargetPaths.add(assetTargetPath)
            moves.push(createMove(assetFile, assetPath, assetTargetPath, 'base64'))
            archiveAssetPaths.delete(assetPath)
        }
    }

    return moves
}

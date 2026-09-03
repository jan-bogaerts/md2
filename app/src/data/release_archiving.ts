import type { MarkdownFile, MoveFile, Card } from './data_types'
import { isSafeAssetFileName, isSupportedAssetFileName, resolveCardAssetPath } from './asset_paths'
import { markdownParsingService } from '../services/data/markdown_parsing_service'
import {
    activityFilePath,
    cardActivityFileName,
} from '../../../shared/activity_paths.mjs'
import type { parseActivityFileForMigration } from '../../../shared/card_activity.mjs'
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

function isAbsoluteAssetReference(reference: string) {
    const normalizedReference = normalizePath(reference)

    return normalizedReference.startsWith('/')
        || /^[a-z]:\//iu.test(normalizedReference)
        || /^[a-z][a-z0-9+.-]*:/iu.test(normalizedReference)
}

function referencedCopiedAssets(references: string[]) {
    return references
        .filter((reference) => reference.length > 0 && !isAbsoluteAssetReference(reference))
        .map(normalizePath)
}

function parsedCardReferences(file: MarkdownFile) {
    const references = markdownParsingService.parse(file.content).header.references

    return Array.isArray(references) ? referencedCopiedAssets(references) : []
}

function allReferencedCardAssets(file: MarkdownFile, references = parsedCardReferences(file)) {
    return [...referencedCardAssets(file), ...references]
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

function releaseActivitySource(card: Card, projectFolder: string) {
    const cardInternalId = card.header.internalId
    if (!cardInternalId) throw new Error(`Cannot release a card without an internal ID: ${card.path}`)
    if (card.header.agentLogReferences.length > 1) {
        throw new Error(`Cannot release card with multiple activity files: ${card.path}`)
    }

    const referencedPath = card.header.agentLogReferences[0] ?? null
    const sourcePath = referencedPath ?? activityFilePath(projectFolder, { cardInternalId, kind: 'card' })

    return { cardInternalId, referenced: referencedPath !== null, sourcePath }
}

export function findReleaseActivityPaths(
    releaseCards: Card[],
    projectFolder: string,
    repositoryFiles: string[],
) {
    const repositoryPaths = new Set(repositoryFiles.map(normalizePath))
    const activityPaths = new Set<string>()

    for (const card of releaseCards) {
        const { referenced, sourcePath } = releaseActivitySource(card, projectFolder)
        const normalizedSourcePath = normalizePath(sourcePath)
        const exists = repositoryPaths.has(normalizedSourcePath)
        if (referenced && !exists) throw new Error(`Missing referenced activity log: ${sourcePath}`)
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

export function findArchiveAssetPaths(files: MarkdownFile[], archivedCards: Card[]) {
    const archivedSourcePaths = new Set(archivedCards.map((card) => normalizePath(card.path)))
    const nonArchivedAssetPaths = new Set(
        files
            .filter((file) => isMarkdownFile(file.path) && !archivedSourcePaths.has(normalizePath(file.path)))
            .flatMap((file) => allReferencedCardAssets(file))
            .map(normalizePath),
    )
    const assetPaths: string[] = []
    const plannedAssetPaths = new Set<string>()

    for (const card of archivedCards) {
        const file = files.find((candidate) => normalizePath(candidate.path) === normalizePath(card.path))
        if (!file) continue

        const cardAssetPaths = allReferencedCardAssets(file, referencedCopiedAssets(card.header.references))
        for (const assetPath of cardAssetPaths.map(normalizePath)) {
            if (nonArchivedAssetPaths.has(assetPath) || plannedAssetPaths.has(assetPath)) continue

            plannedAssetPaths.add(assetPath)
            assetPaths.push(assetPath)
        }
    }

    return assetPaths
}

export function buildReleaseMoves(
    files: MarkdownFile[],
    activeCards: Card[],
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
        const { cardInternalId, referenced, sourcePath } = releaseActivitySource(card, projectFolder)
        const normalizedSourcePath = normalizePath(sourcePath)
        const activityExists = repositoryPaths.has(normalizedSourcePath)
        if (referenced && !activityExists) throw new Error(`Missing referenced activity log: ${sourcePath}`)
        if (!activityExists) continue

        const activityFile = activityFilesByPath.get(normalizedSourcePath)
        if (!activityFile) throw new Error(`Cannot release unloaded activity log: ${sourcePath}`)
        const activityTargetPath = `${targetFolder}/${cardActivityFileName(cardInternalId)}`
        const normalizedActivityTargetPath = normalizePath(activityTargetPath)
        if (existingPaths.has(normalizedActivityTargetPath) || targetPaths.has(normalizedActivityTargetPath)) {
            throw new Error(`Archive target already exists: ${activityTargetPath}`)
        }

        targetPaths.add(normalizedActivityTargetPath)
        cardActivityMoves.set(normalizePath(card.path), createMove(activityFile, sourcePath, activityTargetPath))

        if (!referenced) continue
        const cardMove = moves.find((move) => normalizePath(move.fromPath) === normalizePath(card.path))
        if (!cardMove) throw new Error(`Cannot find release move for card: ${card.path}`)
        rewrittenCardContentByPath.set(
            normalizePath(card.path),
            markdownParsingService.setAgentLogReferences(cardMove.content, [activityTargetPath]),
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
    archivedCards: Card[],
    targetFolder: string,
    repositoryFiles: string[] = [],
): MoveFile[] {
    const existingPaths = new Set([
        ...files.map((file) => normalizePath(file.path)),
        ...repositoryFiles.map(normalizePath),
    ])
    const filesByPath = new Map(files.map((file) => [normalizePath(file.path), file]))
    const archiveAssetPaths = new Set(findArchiveAssetPaths(files, archivedCards))
    const archivedAssetTargets = new Map<string, string>()
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

        const cardAssetPaths = allReferencedCardAssets(file, referencedCopiedAssets(card.header.references))
        for (const assetPath of cardAssetPaths.map(normalizePath)) {
            if (!archiveAssetPaths.has(assetPath)) continue

            const assetTargetPath = targetPathForSource(targetFolder, assetPath)
            if (existingPaths.has(assetTargetPath) || moveTargetPaths.has(assetTargetPath)) {
                throw new Error(`Archive target already exists: ${assetTargetPath}`)
            }

            const assetFile = filesByPath.get(assetPath)
            if (!assetFile) throw new Error(`Cannot archive unloaded card asset: ${assetPath}`)

            moveTargetPaths.add(assetTargetPath)
            moves.push(createMove(assetFile, assetPath, assetTargetPath, 'base64'))
            archivedAssetTargets.set(assetPath, assetTargetPath)
            archiveAssetPaths.delete(assetPath)
        }
    }

    for (const card of archivedCards) {
        const cardMove = moves.find((move) => normalizePath(move.fromPath) === normalizePath(card.path))
        if (!cardMove) continue

        const rewrittenReferences = card.header.references.map((reference) => (
            isAbsoluteAssetReference(reference)
                ? reference
                : archivedAssetTargets.get(normalizePath(reference)) ?? reference
        ))
        const hasRewrittenReference = rewrittenReferences.some((reference, index) => reference !== card.header.references[index])
        if (hasRewrittenReference) cardMove.content = markdownParsingService.setReferences(cardMove.content, rewrittenReferences)
    }

    return moves
}

type ProjectActivity = ReturnType<typeof parseActivityFileForMigration>

/** Conversation statuses that can never produce more activity, so the release may take them away. */
const ARCHIVABLE_CONVERSATION_STATUSES = new Set(['cancelled', 'completed'])

/** System records reference no conversation, so a release always takes them along. */
function recordConversationIds(record: ProjectActivity['records'][number]) {
    if (record.type === 'system') return []
    const referenced = [...record.conversationIds]
    if (record.rootConversationId) referenced.push(record.rootConversationId)

    return referenced
}

/**
 * Splits project activity into the part a release archives and the part that stays behind.
 * A record travels only when every conversation it references travels, so a record straddling
 * both sides remains readable in `activity/project.json`.
 */
export function splitProjectActivity(activity: ProjectActivity) {
    const archivedConversationIds = new Set(activity.conversations
        .filter(({ status }) => ARCHIVABLE_CONVERSATION_STATUSES.has(status))
        .map(({ id }) => id))
    const archivedRecords = activity.records.filter((record) => (
        recordConversationIds(record).every((conversationId) => archivedConversationIds.has(conversationId))
    ))
    const archivedRecordSet = new Set(archivedRecords)
    const archived = {
        ...activity,
        conversations: activity.conversations.filter(({ id }) => archivedConversationIds.has(id)),
        records: archivedRecords,
    }
    const kept = {
        ...activity,
        conversations: activity.conversations.filter(({ id }) => !archivedConversationIds.has(id)),
        records: activity.records.filter((record) => !archivedRecordSet.has(record)),
    }

    return {
        archived,
        hasArchivableActivity: archived.conversations.length > 0 || archived.records.length > 0,
        kept,
    }
}

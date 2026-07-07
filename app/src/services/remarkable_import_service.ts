import { resolveCardAssetPath } from '../data/asset_paths'
import { createCardFile } from '../data/card_naming'
import type { CardDraft, MarkdownFile, ProjectConfig, ProjectReference, StorageService } from '../data/data_types'
import {
    getRemarkableBridge,
    validateRemarkableSettings,
    type RemarkableBridge,
    type RemarkableConnectionSettings,
    type RemarkableImportedAsset,
} from '../data/remarkable_bridge'
import {
    parseImportMetadata,
    recordImports,
    remarkableDeviceKey,
    remarkableMetadataPath,
    serializeImportMetadata,
    type RemarkableImportEntry,
} from '../data/remarkable_import_metadata'

export interface ExistingCardTarget {
    cardPath: string
    kind: 'existing'
}

export interface NewCardTarget {
    draft: CardDraft
    kind: 'new'
}

export type RemarkableImportTarget = ExistingCardTarget | NewCardTarget

export interface BuildRemarkableImportInput {
    assets: RemarkableImportedAsset[]
    config: Pick<ProjectConfig, 'cardBodyTemplate' | 'cardTypes' | 'workingFolder'>
    files: MarkdownFile[]
    importedAt: string
    metadataContent: string | null
    settings: RemarkableConnectionSettings
    target: RemarkableImportTarget
}

export interface RemarkableImportInput {
    paths: string[]
    settings: RemarkableConnectionSettings
    target: RemarkableImportTarget
}

export interface ExecuteRemarkableImportInput {
    bridge: RemarkableBridge | null
    commitAndMergeFiles: (request: Parameters<StorageService['commit']>[0], fallbackFiles: MarkdownFile[]) => Promise<MarkdownFile[]>
    config: ProjectConfig
    files: MarkdownFile[]
    project: ProjectReference
    request: RemarkableImportInput
    storage: StorageService
}

export interface RemarkableImportPlan {
    cardPath: string
    commitFiles: MarkdownFile[]
    importedAssetPaths: string[]
    message: string
}

export function getRemarkableMetadataContent(files: MarkdownFile[], config: Pick<ProjectConfig, 'workingFolder'>): string | null {
    const path = remarkableMetadataPath(config.workingFolder)

    return files.find((file) => file.path === path)?.content ?? null
}

function fileNameWithoutExtension(name: string) {
    const dot = name.lastIndexOf('.')

    return dot > 0 ? name.slice(0, dot) : name
}

function appendImageLinks(content: string, fileNames: string[]) {
    const links = fileNames.map((name) => `![${fileNameWithoutExtension(name)}](${name})`).join('\n')
    const trimmed = content.replace(/\s+$/u, '')

    return `${trimmed}\n\n${links}\n`
}

function resolveTargetCard(input: BuildRemarkableImportInput): MarkdownFile {
    const target = input.target
    if (target.kind === 'existing') {
        const existing = input.files.find((file) => file.path === target.cardPath)
        if (!existing) throw new Error(`Cannot import into a card that is not loaded: ${target.cardPath}`)

        return existing
    }

    return createCardFile(input.files, input.config.workingFolder, input.config.cardTypes, input.config.cardBodyTemplate, target.draft)
}

/**
 * Build the full set of files for a Remarkable import: the target card (existing or new) with
 * relative image links appended, each imported image as a base64 asset beside the card, and the
 * refreshed import metadata. Throws before producing anything on unsupported types or duplicate
 * target file names, so a failed import never partially updates state.
 */
export function buildRemarkableImport(input: BuildRemarkableImportInput): RemarkableImportPlan {
    if (input.assets.length === 0) throw new Error('No images selected to import')

    const cardFile = resolveTargetCard(input)
    const existingPaths = new Set(input.files.map((file) => file.path))
    const assetPaths = new Set<string>()
    const assetFiles: MarkdownFile[] = []
    const metadataEntries: RemarkableImportEntry[] = []

    for (const asset of input.assets) {
        const path = resolveCardAssetPath(cardFile.path, asset.name)
        if (assetPaths.has(path) || existingPaths.has(path)) throw new Error(`Duplicate import target file name: ${path}`)

        assetPaths.add(path)
        assetFiles.push({ content: asset.content, encoding: 'base64', path })
        metadataEntries.push({ devicePath: asset.sourcePath, localPath: path, modifiedTime: asset.modifiedTime })
    }

    const linkedCard: MarkdownFile = {
        ...cardFile,
        content: appendImageLinks(cardFile.content, input.assets.map((asset) => asset.name)),
    }

    const deviceKey = remarkableDeviceKey(input.settings)
    const metadata = recordImports(parseImportMetadata(input.metadataContent), deviceKey, metadataEntries, input.importedAt)
    const metadataFile: MarkdownFile = {
        content: serializeImportMetadata(metadata),
        encoding: 'utf-8',
        path: remarkableMetadataPath(input.config.workingFolder),
    }

    const message =
        input.target.kind === 'existing'
            ? `Import Remarkable images into ${cardFile.path}`
            : `Create ${cardFile.path} with Remarkable images`

    return {
        cardPath: cardFile.path,
        commitFiles: [linkedCard, ...assetFiles, metadataFile],
        importedAssetPaths: assetFiles.map((file) => file.path),
        message,
    }
}

/**
 * Import selected Remarkable images beside a target card and commit the card, image assets and
 * refreshed import metadata together.
 */
export async function importRemarkableImages(input: ExecuteRemarkableImportInput): Promise<RemarkableImportPlan> {
    const bridge = input.bridge ?? getRemarkableBridge()
    if (!bridge) throw new Error('Remarkable import requires Electron local mode')

    const settings = validateRemarkableSettings(input.request.settings)
    const assets = await bridge.importFiles({ paths: input.request.paths, settings })
    const plan = buildRemarkableImport({
        assets,
        config: input.config,
        files: input.files,
        importedAt: new Date().toISOString(),
        metadataContent: getRemarkableMetadataContent(input.files, input.config),
        settings,
        target: input.request.target,
    })

    await input.commitAndMergeFiles({
        branch: input.project.branch,
        files: plan.commitFiles,
        message: plan.message,
    }, plan.commitFiles)

    if (input.config.pushMode === 'auto') await input.storage.push(input.project)

    return plan
}

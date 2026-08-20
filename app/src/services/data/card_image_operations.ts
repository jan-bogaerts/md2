import { resolveCardAssetPath } from '../../data/asset_paths'
import type { MarkdownFile } from '../../data/data_types'
import type { CardOperationContext } from './card_operation_context'
import { dialogService } from '../dialog_service'

const BASE64_CHUNK_SIZE = 32768
const MAXIMUM_FILE_NAME_ATTEMPTS = 100
const PASTED_IMAGE_NAME_PREFIX = 'pasted-image-'
const SUPPORTED_CLIPBOARD_IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
}

export interface SavedCardImage {
    fileName: string
    path: string
}

/** Saves an image before inserting its reference, removing the asset if insertion fails. */
export async function saveAndInsertPastedImage(
    file: File,
    insertMarkdown: (markdown: string) => void,
    saveImage: (file: File) => Promise<SavedCardImage>,
    deleteImage: (path: string) => Promise<void>,
) {
    const savedImage = await saveImage(file)
    try {
        insertMarkdown(`![pasted image](<${savedImage.fileName}>)`)
    } catch (error) {
        try {
            await deleteImage(savedImage.path)
        } catch (cleanupError) {
            dialogService.error(cleanupError, { fallbackMessage: `Could not remove ${savedImage.path}` })
        }
        throw error
    }

    return savedImage
}

/** Maps a supported clipboard image MIME type to its persisted extension. */
export function clipboardImageExtension(mimeType: string) {
    const extension = SUPPORTED_CLIPBOARD_IMAGE_EXTENSIONS[mimeType.toLowerCase()]
    if (!extension) throw new Error(`Unsupported clipboard image type: ${mimeType}`)

    return extension
}

/** Encodes clipboard binary content for storage commit APIs. */
export async function clipboardImageBase64(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE))
    }

    return btoa(binary)
}

/** Generates a unique bare image name and resolves it beside the destination card. */
export function createAvailablePastedImagePath(
    cardPath: string,
    mimeType: string,
    existingPaths: Iterable<string>,
    createIdentifier: () => string = () => crypto.randomUUID(),
): SavedCardImage {
    const extension = clipboardImageExtension(mimeType)
    const normalizedExistingPaths = new Set([...existingPaths].map((path) => path.replace(/\\/gu, '/').toLowerCase()))

    for (let attempt = 0; attempt < MAXIMUM_FILE_NAME_ATTEMPTS; attempt += 1) {
        const fileName = `${PASTED_IMAGE_NAME_PREFIX}${createIdentifier()}${extension}`
        const path = resolveCardAssetPath(cardPath, fileName)
        if (!normalizedExistingPaths.has(path.toLowerCase())) return { fileName, path }
    }

    throw new Error('Could not generate an available pasted image file name')
}

/** Persists and removes image assets owned by card editor workflows. */
export class CardImageOperations {
    private readonly context: CardOperationContext
    private readonly reservedPaths = new Set<string>()

    constructor(context: CardOperationContext) {
        this.context = context
    }

    saveForCard(cardPath: string, file: File) {
        return this.save(cardPath, file)
    }

    saveForNewCard(file: File) {
        const { config } = this.context.requireProject('save a pasted image')
        const draftCardPath = `${config.workingFolder}/new-card-draft.md`

        return this.save(draftCardPath, file)
    }

    async delete(path: string) {
        const { config, project, storage } = this.context.requireProject('delete a pasted image')
        const existingFile = this.context.dependencies.files().find((file) => file.path === path)
        const repositoryFile = this.context.dependencies.snapshot()?.repositoryFiles.includes(path) ?? false
        if (!existingFile && !repositoryFile) throw new Error(`Cannot delete a pasted image that is not loaded: ${path}`)

        await storage.deleteFile({
            branch: project.branch,
            message: `Delete ${path}`,
            path,
            ...(existingFile?.sha ? { sha: existingFile.sha } : {}),
        })
        this.context.dependencies.deleteFile(path, [], config.workingFolder)
        this.context.dependencies.dispatchChanged()

        if (config.pushMode === 'auto') {
            try {
                await storage.push(project)
            } catch (error) {
                dialogService.error(error, { fallbackMessage: `${path} was deleted locally, but could not be pushed` })
            }
        }
    }

    private async save(cardPath: string, file: File) {
        const { project } = this.context.requireProject('save a pasted image')
        const existingPaths = [
            ...this.context.dependencies.files().map(({ path }) => path),
            ...(this.context.dependencies.snapshot()?.repositoryFiles ?? []),
            ...this.reservedPaths,
        ]
        const savedImage = createAvailablePastedImagePath(cardPath, file.type, existingPaths)
        this.reservedPaths.add(savedImage.path)

        try {
            const imageFile: MarkdownFile = {
                content: await clipboardImageBase64(file),
                encoding: 'base64',
                path: savedImage.path,
            }
            await this.context.commitAndMergeFiles({
                branch: project.branch,
                files: [imageFile],
                message: `Add ${savedImage.path}`,
            }, [imageFile])
            this.context.dependencies.dispatchPersistenceChanged()
            void this.context.pushCreatedItem('Pasted image')

            return savedImage
        } finally {
            this.reservedPaths.delete(savedImage.path)
        }
    }
}

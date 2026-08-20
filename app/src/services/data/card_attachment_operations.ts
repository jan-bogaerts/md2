import { cardFolder, isSafeAssetFileName } from '../../data/asset_paths'
import type { MarkdownFile } from '../../data/data_types'
import { dialogService } from '../dialog_service'
import type { CardOperationContext } from './card_operation_context'

const BASE64_CHUNK_SIZE = 32768
const MAXIMUM_FILE_NAME_ATTEMPTS = 100

export interface SavedCardAttachment {
    fileName: string
    path: string
}

/** Encodes arbitrary browser file bytes for repository storage. */
export async function attachmentBase64(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE))
    }

    return btoa(binary)
}

function suffixedFileName(fileName: string, suffix: number) {
    const extensionStart = fileName.lastIndexOf('.')
    if (extensionStart <= 0) return `${fileName}-${suffix}`

    return `${fileName.slice(0, extensionStart)}-${suffix}${fileName.slice(extensionStart)}`
}

/** Resolves a collision-safe attachment path beside a card while preserving its base name. */
export function createAvailableAttachmentPath(
    cardPath: string,
    fileName: string,
    existingPaths: Iterable<string>,
): SavedCardAttachment {
    if (!isSafeAssetFileName(fileName)) throw new Error(`Unsafe attachment file name: ${fileName}`)

    const folder = cardFolder(cardPath)
    const normalizedExistingPaths = new Set([...existingPaths].map((path) => path.replace(/\\/gu, '/').toLowerCase()))
    for (let attempt = 0; attempt < MAXIMUM_FILE_NAME_ATTEMPTS; attempt += 1) {
        const availableFileName = attempt === 0 ? fileName : suffixedFileName(fileName, attempt)
        const path = folder.length > 0 ? `${folder}/${availableFileName}` : availableFileName
        if (!normalizedExistingPaths.has(path.toLowerCase())) return { fileName: availableFileName, path }
    }

    throw new Error(`Could not generate an available attachment file name for ${fileName}`)
}

/** Applies references only after copied files persist, cleaning copied files when application fails. */
export async function copyAndApplyAttachments<T>(
    files: File[],
    copyFiles: (files: File[]) => Promise<SavedCardAttachment[]>,
    applyAttachments: (attachments: SavedCardAttachment[]) => T | Promise<T>,
    deleteFiles: (paths: string[]) => Promise<void>,
) {
    const attachments = await copyFiles(files)
    try {
        await applyAttachments(attachments)
    } catch (error) {
        try {
            await deleteFiles(attachments.map(({ path }) => path))
        } catch (cleanupError) {
            dialogService.error(cleanupError, { fallbackMessage: 'Could not remove copied attachments' })
        }
        throw error
    }

    return attachments
}

/** Persists arbitrary copied files without changing clipboard-image behavior. */
export class CardAttachmentOperations {
    private readonly context: CardOperationContext
    private readonly reservedPaths = new Set<string>()

    constructor(context: CardOperationContext) {
        this.context = context
    }

    copyForCard(cardPath: string, files: File[]) {
        return this.copy(cardPath, files)
    }

    copyForNewCard(files: File[]) {
        const { config } = this.context.requireProject('copy an attachment')
        const draftCardPath = `${config.workingFolder}/new-card-draft.md`

        return this.copy(draftCardPath, files)
    }

    async delete(paths: string[]) {
        for (const path of paths) await this.deleteOne(path)
    }

    private async copy(cardPath: string, files: File[]) {
        if (files.length === 0) return []

        const { project } = this.context.requireProject('copy an attachment')
        const existingPaths = [
            ...this.context.dependencies.files().map(({ path }) => path),
            ...(this.context.dependencies.snapshot()?.repositoryFiles ?? []),
            ...this.reservedPaths,
        ]
        const attachments: SavedCardAttachment[] = []
        for (const file of files) {
            const attachment = createAvailableAttachmentPath(cardPath, file.name, existingPaths)
            attachments.push(attachment)
            existingPaths.push(attachment.path)
            this.reservedPaths.add(attachment.path)
        }

        try {
            const attachmentFiles: MarkdownFile[] = []
            for (let index = 0; index < files.length; index += 1) {
                attachmentFiles.push({
                    content: await attachmentBase64(files[index]),
                    encoding: 'base64',
                    path: attachments[index].path,
                })
            }
            await this.context.commitAndMergeFiles({
                branch: project.branch,
                files: attachmentFiles,
                message: attachments.length === 1 ? `Add ${attachments[0].path}` : `Add ${attachments.length} attachments`,
            }, attachmentFiles)
            this.context.dependencies.dispatchPersistenceChanged()
            void this.context.pushCreatedItem(attachments.length === 1 ? 'Attachment' : 'Attachments')

            return attachments
        } finally {
            attachments.forEach(({ path }) => this.reservedPaths.delete(path))
        }
    }

    private async deleteOne(path: string) {
        const { config, project, storage } = this.context.requireProject('delete an attachment')
        const existingFile = this.context.dependencies.files().find((file) => file.path === path)
        const repositoryFile = this.context.dependencies.snapshot()?.repositoryFiles.includes(path) ?? false
        if (!existingFile && !repositoryFile) throw new Error(`Cannot delete an attachment that is not loaded: ${path}`)

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
}

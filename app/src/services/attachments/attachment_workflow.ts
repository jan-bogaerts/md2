import type { SavedCardAttachment } from '../data/card_attachment_operations'
import { copyAndApplyAttachments } from '../data/card_attachment_operations'
import { dataService } from '../data/data_service'
import { attachmentChoiceService } from './attachment_choice_service'

export type AttachmentMarkdownInserter = (markdown: string) => void

function escapeMarkdownLabel(label: string) {
    return label.replace(/([\\\]])/gu, '\\$1')
}

/** Converts a trusted absolute filesystem path to Markdown's absolute file URL form. */
export function absoluteFileUrl(filePath: string) {
    const normalizedPath = filePath.replace(/\\/gu, '/')
    const encodedPath = encodeURI(normalizedPath).replace(/#/gu, '%23').replace(/\?/gu, '%3F')
    if (normalizedPath.startsWith('//')) return `file:${encodedPath}`
    if (/^[a-z]:\//iu.test(normalizedPath)) return `file:///${encodedPath}`
    if (normalizedPath.startsWith('/')) return `file://${encodedPath}`

    throw new Error(`Original attachment path is not absolute: ${filePath}`)
}

function attachmentMarkdown(files: File[], paths: string[], originalLocation: boolean) {
    return files.map((file, index) => {
        const target = originalLocation ? absoluteFileUrl(paths[index]) : paths[index]
        const label = escapeMarkdownLabel(file.name)

        return file.type.toLowerCase().startsWith('image/')
            ? `![${label}](<${target}>)`
            : `[${label}](<${target}>)`
    }).join('\n')
}

async function restoreCardReferences(cardPath: string, references: string[]) {
    dataService.cards.setCardReferences(cardPath, references)
    await dataService.cards.flushPendingCommits()
}

/** Runs board-card attachment choice and persists resulting references. */
export async function attachFilesToCard(cardPath: string, files: File[]) {
    const selection = await attachmentChoiceService.choose(files)
    if (!selection) return []

    if (selection.choice === 'original') {
        const paths = selection.originalPaths
        if (!paths) throw new Error('Original attachment paths are unavailable')
        dataService.cards.addCardReferences(cardPath, paths)
        await dataService.cards.flushPendingCommits()

        return paths
    }

    const card = dataService.getState().snapshot?.activeCards.find(({ path }) => path === cardPath)
    if (!card) throw new Error(`Cannot attach files to an unloaded card: ${cardPath}`)
    const previousReferences = [...card.header.references]
    const attachments = await copyAndApplyAttachments(
        files,
        (selectedFiles) => dataService.cards.copyAttachmentsForCard(cardPath, selectedFiles),
        async (savedAttachments) => {
            try {
                dataService.cards.addCardReferences(cardPath, savedAttachments.map(({ path }) => path))
                await dataService.cards.flushPendingCommits()
            } catch (error) {
                await restoreCardReferences(cardPath, previousReferences)
                throw error
            }
        },
        (paths) => dataService.cards.deleteCopiedAttachments(paths),
    )

    return attachments.map(({ path }) => path)
}

async function insertCopiedMarkdown(
    files: File[],
    attachments: SavedCardAttachment[],
    insertMarkdown: AttachmentMarkdownInserter,
) {
    insertMarkdown(attachmentMarkdown(files, attachments.map(({ fileName }) => fileName), false))
}

/** Runs Markdown attachment choice for an existing card-backed editor. */
export async function attachFilesToCardMarkdown(
    cardPath: string,
    files: File[],
    insertMarkdown: AttachmentMarkdownInserter,
) {
    const selection = await attachmentChoiceService.choose(files)
    if (!selection) return

    if (selection.choice === 'original') {
        if (!selection.originalPaths) throw new Error('Original attachment paths are unavailable')
        insertMarkdown(attachmentMarkdown(files, selection.originalPaths, true))
        return
    }

    await copyAndApplyAttachments(
        files,
        (selectedFiles) => dataService.cards.copyAttachmentsForCard(cardPath, selectedFiles),
        (attachments) => insertCopiedMarkdown(files, attachments, insertMarkdown),
        (paths) => dataService.cards.deleteCopiedAttachments(paths),
    )
}

export { attachmentMarkdown }

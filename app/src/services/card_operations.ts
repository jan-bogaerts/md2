import { createCardFile } from '../data/card_naming'
import { computeMove, orderByAfter, UNASSIGNED_STATUS } from '../data/card_ordering'
import type { CardDraft, MarkdownFile, ProjectSnapshot, StorageService } from '../data/data_types'
import { markdownParsingService } from './markdown_parsing_service'
import { telemetryService } from './telemetry_service'
import {
    type DataServiceContext,
    mergeFiles,
    reportCommitFlushFailure,
} from './data_service_context'

type CommitRequest = Parameters<StorageService['commit']>[0]

function statusOf(card: ProjectSnapshot['activeCards'][number]) {
    return card.header.status ?? UNASSIGNED_STATUS
}

export class CardOperations {
    private readonly context: DataServiceContext
    private readonly triggerStateActions: (cardPath: string, state: string) => void

    constructor(
        context: DataServiceContext,
        triggerStateActions: (cardPath: string, state: string) => void,
    ) {
        this.context = context
        this.triggerStateActions = triggerStateActions
    }

    async createCard(draft: CardDraft) {
        const { config, storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) throw new Error('Cannot create a card before a project is open')

        const file = createCardFile(this.context.getCurrentFiles(), config.workingFolder, config.cardTypes, config.cardBodyTemplate, draft)
        this.context.setCurrentFiles([...this.context.getCurrentFiles(), file])
        await this.commitAndMergeFiles({
            branch: currentProject.branch,
            files: [file],
            message: `Create ${file.path}`,
        }, [file])

        if (config.pushMode === 'auto') await storage.push(currentProject)

        this.context.refreshSnapshot()
        telemetryService.trackEvent('create_card')

        return file
    }

    updateCardBody(path: string, body: string) {
        const existingFile = this.context.requireFile(path)

        return this.saveFile({ content: markdownParsingService.replaceBody(existingFile.content, body), path, sha: existingFile.sha })
    }

    updateCardAffects(path: string, affects: string[]) {
        const existingFile = this.context.requireFile(path)

        return this.saveFile({ content: markdownParsingService.setAffects(existingFile.content, affects), path, sha: existingFile.sha })
    }

    updateCardHeaderFields(path: string, updates: Record<string, string>) {
        const existingFile = this.context.requireFile(path)

        return this.saveFile({
            content: markdownParsingService.rewriteHeader(existingFile.content, updates),
            path,
            sha: existingFile.sha,
        })
    }

    updateCardTitle(path: string, title: string) {
        return this.updateCardHeaderFields(path, { title })
    }

    toggleCardPolicy(path: string, policyKey: string) {
        const { config } = this.context.requireDependencies()
        const existingFile = this.context.requireFile(path)
        const card = markdownParsingService.parseCard(existingFile, config.workingFolder)
        const enabled = card.header.policy[policyKey] === 'true'

        return this.saveFile({
            content: markdownParsingService.setPolicyFlag(existingFile.content, policyKey, !enabled),
            path,
            sha: existingFile.sha,
        })
    }

    moveCard(cardPath: string, targetStatus: string, targetIndex: number) {
        const activeCards = this.context.getCurrentSnapshot()?.activeCards ?? []
        const movedCard = activeCards.find((card) => card.path === cardPath)
        const previousStatus = movedCard?.header.status ?? null
        const updates = computeMove(activeCards, cardPath, targetStatus, targetIndex)

        for (const update of updates) {
            this.updateCardHeaderFields(update.path, { after: update.after ?? '', status: update.status })
        }

        if (movedCard && previousStatus !== targetStatus) this.triggerStateActions(movedCard.path, targetStatus)

        return updates
    }

    async deleteCard(path: string) {
        const card = this.context.getCurrentSnapshot()?.activeCards.find((currentCard) => currentCard.path === path)
        if (!card) throw new Error(`Cannot delete an active card that is not loaded: ${path}`)

        return this.deleteLoadedFile(path, true)
    }

    async deleteFile(path: string) {
        this.context.requireFile(path)

        const activeCard = this.context.getCurrentSnapshot()?.activeCards.some((card) => card.path === path) ?? false

        return this.deleteLoadedFile(path, activeCard)
    }

    saveFile(file: MarkdownFile) {
        const { commitBatcher } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) throw new Error('Cannot save a file before a project is open')

        const currentFiles = this.context.getCurrentFiles().map((currentFile) => (currentFile.path === file.path ? file : currentFile))
        this.context.setCurrentFiles(currentFiles)
        commitBatcher.schedule(currentProject.branch, [file], `Update ${file.path}`)
        this.context.refreshSnapshot()

        return file
    }

    async saveProjectFile(file: MarkdownFile, message: string) {
        const { config, storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) throw new Error('Cannot save a project file before a project is open')

        await this.commitAndMergeFiles({
            branch: currentProject.branch,
            files: [file],
            message,
        }, [file])

        if (config.pushMode === 'auto') await storage.push(currentProject)

        return file
    }

    async flushPendingCommits() {
        await this.flushPendingCommitBatch()
    }

    async flushPendingCommitBatch() {
        const { commitBatcher } = this.context.requireDependencies()
        const hadPendingCommits = commitBatcher.hasPending()

        try {
            await commitBatcher.flush()
        } catch (error) {
            reportCommitFlushFailure(error, this.context.dispatchChanged)
            throw error
        }

        if (hadPendingCommits) this.context.dispatchChanged()
    }

    async commitFiles(request: CommitRequest) {
        const { config, storage } = this.context.requireDependencies()
        const commitPaths = request.files.map((file) => file.path)
        const inFlightCommitPaths = this.context.getInFlightCommitPaths()
        commitPaths.forEach((path) => inFlightCommitPaths.add(path))
        let updatedFiles: MarkdownFile[] = []

        try {
            updatedFiles = await storage.commit(request)
        } finally {
            commitPaths.forEach((path) => inFlightCommitPaths.delete(path))
        }

        if (updatedFiles.length > 0) {
            this.context.setCurrentFiles(mergeFiles(this.context.getCurrentFiles(), updatedFiles))
            this.context.refreshSnapshot()
        }

        const currentProject = this.context.getCurrentProject()
        if (currentProject && config.pushMode === 'auto') await storage.push(currentProject)
        if (config.pushMode === 'manual') this.context.dispatchChanged()
    }

    async commitAndMergeFiles(request: CommitRequest, fallbackFiles: MarkdownFile[] = []) {
        const { storage } = this.context.requireDependencies()
        const commitPaths = request.files.map((file) => file.path)
        const inFlightCommitPaths = this.context.getInFlightCommitPaths()
        commitPaths.forEach((path) => inFlightCommitPaths.add(path))
        let updatedFiles: MarkdownFile[] = []

        try {
            updatedFiles = await storage.commit(request)
        } finally {
            commitPaths.forEach((path) => inFlightCommitPaths.delete(path))
        }
        const committedFiles = updatedFiles.length > 0 ? updatedFiles : fallbackFiles
        if (committedFiles.length === 0) return updatedFiles

        this.context.setCurrentFiles(mergeFiles(this.context.getCurrentFiles(), committedFiles))
        this.context.refreshSnapshot()

        return updatedFiles
    }

    private async deleteLoadedFile(path: string, repairActiveOrdering: boolean) {
        const { config, storage } = this.context.requireDependencies()
        const currentProject = this.context.getCurrentProject()
        if (!currentProject) throw new Error('Cannot delete a file before a project is open')

        await this.flushPendingCommitBatch()

        const existingFile = this.context.requireFile(path)
        const repairFile = repairActiveOrdering ? this.createDeleteRepairFile(path) : null

        if (repairFile) {
            await storage.commit({
                branch: currentProject.branch,
                files: [repairFile],
                message: `Repair ordering after deleting ${path}`,
            })
        }

        await storage.deleteFile({
            branch: currentProject.branch,
            message: `Delete ${path}`,
            path,
            sha: existingFile.sha,
        })

        if (config.pushMode === 'auto') await storage.push(currentProject)

        await this.context.reloadCurrentProjectSnapshot()

        return this.context.getCurrentSnapshot()
    }

    private createDeleteRepairFile(path: string): MarkdownFile | null {
        const activeCards = this.context.getCurrentSnapshot()?.activeCards ?? []
        const deletedCard = activeCards.find((card) => card.path === path)
        if (!deletedCard) return null
        if (!deletedCard.header.internalId) return null

        const column = orderByAfter(activeCards.filter((card) => statusOf(card) === statusOf(deletedCard)))
        const deletedIndex = column.findIndex((card) => card.path === path)
        const follower = column[deletedIndex + 1]
        if (!follower || follower.header.after !== deletedCard.header.internalId) return null

        const followerFile = this.context.requireFile(follower.path)

        return {
            content: markdownParsingService.rewriteHeader(followerFile.content, { after: deletedCard.header.after ?? '' }),
            path: followerFile.path,
            sha: followerFile.sha,
        }
    }
}

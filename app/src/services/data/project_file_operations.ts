import { orderByAfter, statusOf } from '../../data/card_ordering'
import type { MarkdownFile } from '../../data/data_types'
import { newFolderPath, newMarkdownFilePath } from '../../data/project_tree_paths'
import type { CardOperationContext } from './card_operation_context'
import { markdownParsingService } from './markdown_parsing_service'
import { setCardHeaderFields } from './canonical_card'

const FOLDER_PLACEHOLDER_NAME = '.gitkeep'

/** Creating, saving and deleting plain project files and folders outside the card workflow. */
export class ProjectFileOperations {
    private readonly context: CardOperationContext

    constructor(context: CardOperationContext) {
        this.context = context
    }

    async createFolder(parentDirectory: string, name: string) {
        const { config, project, storage } = this.context.requireProject('create a folder')

        const folderPath = newFolderPath(parentDirectory, name, config.projectFolder)
        this.context.requireAvailablePath(folderPath)
        await storage.commit({
            branch: project.branch,
            files: [{ content: '', path: `${folderPath}/${FOLDER_PLACEHOLDER_NAME}` }],
            message: `Create ${folderPath}`,
        })
        await this.context.pushCreatedItem('Folder')
        await this.context.dependencies.reloadCurrentProjectSnapshot()

        return folderPath
    }

    async createMarkdownFile(parentDirectory: string, name: string) {
        const { config, project } = this.context.requireProject('create a Markdown file')

        const path = newMarkdownFilePath(parentDirectory, name, config.projectFolder)
        this.context.requireAvailablePath(path)
        const file = { content: '', path }
        await this.context.commitAndMergeFiles({
            branch: project.branch,
            files: [file],
            message: `Create ${path}`,
        }, [file])
        await this.context.pushCreatedItem('Markdown file')

        return file
    }

    async saveProjectFile(file: MarkdownFile, message: string) {
        const { config, project, storage } = this.context.requireProject('save a project file')

        await this.context.commitAndMergeFiles({ branch: project.branch, files: [file], message }, [file])

        if (config.pushMode === 'auto') await storage.push(project)

        return file
    }

    async deleteFolder(path: string) {
        const { config, project, storage } = this.context.requireProject('delete a folder')

        const folderPrefix = `${path.replace(/\/+$/u, '')}/`
        const repositoryFiles = this.context.dependencies.snapshot()?.repositoryFiles ?? []
        if (!repositoryFiles.some((filePath) => filePath.startsWith(folderPrefix))) {
            throw new Error(`Cannot delete a folder that is not loaded: ${path}`)
        }

        await this.context.flushPendingCommits()
        await storage.deleteFolder({ branch: project.branch, message: `Delete ${path}`, path })
        if (config.pushMode === 'auto') await storage.push(project)
        await this.context.dependencies.reloadCurrentProjectSnapshot()

        return this.context.dependencies.snapshot()
    }

    /** Deletes a file, first repairing the `after` chain when an ordered active card leaves the board. */
    async deleteProjectFile(path: string, repairActiveOrdering: boolean) {
        const { dependencies } = this.context
        const { config, project, storage } = this.context.requireProject('delete a file')

        await this.context.flushPendingCommits()

        const existingFile = dependencies.files().find((file) => file.path === path)
        const repairFile = repairActiveOrdering ? this.createDeleteRepairFile(path) : null
        let committedRepairFiles: MarkdownFile[] = []

        if (repairFile) {
            committedRepairFiles = await storage.commit({
                branch: project.branch,
                files: [repairFile],
                message: `Repair ordering after deleting ${path}`,
            })
        }

        await storage.deleteFile({
            branch: project.branch,
            message: `Delete ${path}`,
            path,
            ...(existingFile?.sha ? { sha: existingFile.sha } : {}),
        })

        if (config.pushMode === 'auto') await storage.push(project)

        if (repairFile && committedRepairFiles.length === 0) committedRepairFiles = [repairFile]
        dependencies.deleteFile(path, committedRepairFiles, config.workingFolder)
        dependencies.dispatchChanged()

        return dependencies.snapshot()
    }

    /** Relinks the follower of a deleted card onto the deleted card's predecessor. */
    private createDeleteRepairFile(path: string): MarkdownFile | null {
        const activeCards = this.context.dependencies.snapshot()?.activeCards ?? []
        const deletedCard = activeCards.find((card) => card.path === path)
        if (!deletedCard?.header.internalId) return null

        const column = orderByAfter(activeCards.filter((card) => statusOf(card) === statusOf(deletedCard)))
        const deletedIndex = column.findIndex((card) => card.path === path)
        const follower = column[deletedIndex + 1]
        if (!follower || follower.header.after !== deletedCard.header.internalId) return null

        const { config } = this.context.dependencies.requireDependencies()
        const followerCard = this.context.dependencies.mutateCard(
            follower.path,
            (card) => setCardHeaderFields(card, { after: deletedCard.header.after ?? '' }),
            config.workingFolder,
        )

        return markdownParsingService.serializeCard(followerCard)
    }
}

import type { MarkdownFile, ProjectReference, ProjectSnapshot } from '../data/data_types'
import { markdownParsingService } from './markdown_parsing_service'
import { mergeFiles } from './data_service_context'

type CardCollections = Pick<ProjectSnapshot, 'activeCards' | 'backgroundCards'>

type AttachAgentConversations = (cards: CardCollections) => CardCollections

function isSameProjectReference(left: ProjectReference | null, right: ProjectReference) {
    return left?.branch === right.branch
        && left.id === right.id
        && left.owner === right.owner
        && left.repository === right.repository
        && left.rootPath === right.rootPath
}

export class ProjectState {
    private agentConversationLoadToken = 0
    private currentFiles: MarkdownFile[] = []
    private currentProject: ProjectReference | null = null
    private currentSnapshot: ProjectSnapshot | null = null
    private readonly inFlightCommitPaths: Set<string> = new Set()
    private projectLoadToken = 0
    private readonly attachAgentConversations: AttachAgentConversations

    constructor(attachAgentConversations: AttachAgentConversations) {
        this.attachAgentConversations = attachAgentConversations
    }

    get files() { return this.currentFiles }
    get project() { return this.currentProject }
    get snapshot() { return this.currentSnapshot }
    get commitPathsInFlight() { return this.inFlightCommitPaths }
    get agentConversationToken() { return this.agentConversationLoadToken }
    get projectToken() { return this.projectLoadToken }

    resetLoadedProject() {
        this.currentFiles = []
        this.currentProject = null
        this.currentSnapshot = null
        this.inFlightCommitPaths.clear()
    }

    replaceProject(project: ProjectReference | null) {
        this.currentProject = project
    }

    replaceProjectFiles(files: MarkdownFile[], workingFolder: string, repositoryFiles: string[]) {
        this.currentFiles = files
        this.currentSnapshot = this.createSnapshot(files, workingFolder, repositoryFiles)
    }

    replaceFiles(files: MarkdownFile[], workingFolder: string) {
        const repositoryFiles = this.currentSnapshot?.repositoryFiles ?? []
        this.replaceProjectFiles(files, workingFolder, repositoryFiles)
    }

    mergeCommittedFiles(files: MarkdownFile[], workingFolder: string) {
        this.replaceFiles(mergeFiles(this.currentFiles, files), workingFolder)
    }

    beginProjectLoad() {
        this.projectLoadToken += 1
        return this.projectLoadToken
    }

    isCurrentLoad(project: ProjectReference, projectLoadToken: number) {
        return this.projectLoadToken === projectLoadToken && isSameProjectReference(this.currentProject, project)
    }

    beginAgentConversationLoad() {
        this.agentConversationLoadToken += 1
        return this.agentConversationLoadToken
    }

    isCurrentAgentConversationLoad(agentConversationLoadToken: number) {
        return this.agentConversationLoadToken === agentConversationLoadToken
    }

    requireFile(path: string): MarkdownFile {
        const existingFile = this.currentFiles.find((currentFile) => currentFile.path === path)
        if (!existingFile) throw new Error(`Cannot update a card that is not loaded: ${path}`)

        return existingFile
    }

    refreshSnapshot(workingFolder: string) {
        const repositoryFiles = this.currentSnapshot?.repositoryFiles ?? []
        this.currentSnapshot = this.createSnapshot(this.currentFiles, workingFolder, repositoryFiles)
    }

    private createSnapshot(files: MarkdownFile[], workingFolder: string, repositoryFiles: string[]): ProjectSnapshot {
        const cards = markdownParsingService.splitCards(files, workingFolder)

        return { ...this.attachAgentConversations(cards), repositoryFiles, workingFolder }
    }
}

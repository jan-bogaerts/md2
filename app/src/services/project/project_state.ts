import type { MarkdownFile, ProjectCard, ProjectReference, ProjectSnapshot } from '../../data/data_types'
import { markdownParsingService, type CardParseError } from '../data/markdown_parsing_service'
import { mergeFiles } from '../data/data_service_context'

type CardCollections = Pick<ProjectSnapshot, 'activeCards' | 'backgroundCards'>

type AttachAgentConversations = (cards: CardCollections) => CardCollections
type ReportCardParseErrors = (errors: CardParseError[]) => void

const ignoreCardParseErrors: ReportCardParseErrors = () => undefined

/** Cache entry tying a produced card to the inputs it was derived from. */
interface CardCacheEntry {
    card: ProjectCard
    fileContent: string
}

function isSameArray<T>(previous: readonly T[], next: readonly T[]) {
    return previous.length === next.length && next.every((item, index) => previous[index] === item)
}

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
    private cardCacheByPath = new Map<string, CardCacheEntry>()
    private parseErrorPaths: Set<string> = new Set()
    private readonly attachAgentConversations: AttachAgentConversations
    private readonly reportCardParseErrors: ReportCardParseErrors

    constructor(attachAgentConversations: AttachAgentConversations, reportCardParseErrors = ignoreCardParseErrors) {
        this.attachAgentConversations = attachAgentConversations
        this.reportCardParseErrors = reportCardParseErrors
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
        this.cardCacheByPath.clear()
        this.parseErrorPaths.clear()
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
        const parsedCards = markdownParsingService.splitCards(files, workingFolder)
        const newParseErrors = parsedCards.parseErrors.filter(({ path }) => !this.parseErrorPaths.has(path))
        this.parseErrorPaths = new Set(parsedCards.parseErrors.map(({ path }) => path))
        if (newParseErrors.length > 0) this.reportCardParseErrors(newParseErrors)
        const cards = this.attachAgentConversations(parsedCards)
        const fileContentByPath = new Map(files.map((file) => [file.path, file.content]))
        const nextCache = new Map<string, CardCacheEntry>()
        const activeCards = cards.activeCards.map((card) => this.reuseUnchangedCard(card, fileContentByPath, nextCache))
        const backgroundCards = cards.backgroundCards.map((card) => this.reuseUnchangedCard(card, fileContentByPath, nextCache))
        this.cardCacheByPath = nextCache

        const previous = this.currentSnapshot
        const snapshot: ProjectSnapshot = {
            activeCards: previous && isSameArray(previous.activeCards, activeCards) ? previous.activeCards : activeCards,
            backgroundCards: previous && isSameArray(previous.backgroundCards, backgroundCards)
                ? previous.backgroundCards
                : backgroundCards,
            repositoryFiles,
            workingFolder,
        }
        const isSameSnapshot = previous
            && previous.activeCards === snapshot.activeCards
            && previous.backgroundCards === snapshot.backgroundCards
            && previous.repositoryFiles === repositoryFiles
            && previous.workingFolder === workingFolder

        return isSameSnapshot ? previous : snapshot
    }

    /**
     * Returns the previously produced card object when everything it derives
     * from is unchanged, so React memos keyed on card identity stay stable
     * across snapshot rebuilds.
     */
    private reuseUnchangedCard(
        card: ProjectCard,
        fileContentByPath: Map<string, string>,
        nextCache: Map<string, CardCacheEntry>,
    ): ProjectCard {
        const cached = this.cardCacheByPath.get(card.path)
        const fileContent = fileContentByPath.get(card.path) ?? ''
        const isUnchanged = cached
            && cached.fileContent === fileContent
            && cached.card.sha === card.sha
            && cached.card.isActive === card.isActive
            && isSameArray(cached.card.agentConversations, card.agentConversations)
            && isSameArray(cached.card.agentConversationErrors, card.agentConversationErrors)
        const nextCard = isUnchanged && cached ? cached.card : card

        nextCache.set(card.path, { card: nextCard, fileContent })

        return nextCard
    }
}

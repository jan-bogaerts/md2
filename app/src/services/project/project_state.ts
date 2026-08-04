import type { MarkdownFile, ProjectCard, ProjectReference, ProjectSnapshot } from '../../data/data_types'
import { markdownParsingService, type CardParseError } from '../data/markdown_parsing_service'
import { mergeFiles } from '../data/data_service_context'

type CardCollections = Pick<ProjectSnapshot, 'activeCards' | 'backgroundCards'>

type AttachAgentConversations = (cards: CardCollections) => CardCollections
type ReportCardParseErrors = (errors: CardParseError[]) => void
type ActiveCardsChanged = (previousCards: ProjectCard[], nextCards: ProjectCard[]) => void

const ignoreCardParseErrors: ReportCardParseErrors = () => undefined

/** Cache entry tying a produced card to the inputs it was derived from. */
interface CardCacheEntry {
    card: ProjectCard
    fileContent: string
}

/** FNV-1a, enough to recognize the watcher echo of our own writes. */
function hashContent(content: string) {
    let hash = 0x811c9dc5
    for (let index = 0; index < content.length; index += 1) {
        hash ^= content.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }

    return hash >>> 0
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
    private readonly committedContentHashByPath = new Map<string, number>()
    private projectLoadToken = 0
    private cardCacheByPath = new Map<string, CardCacheEntry>()
    private parseErrorPaths: Set<string> = new Set()
    private readonly attachAgentConversations: AttachAgentConversations
    private readonly activeCardsChanged: ActiveCardsChanged
    private readonly reportCardParseErrors: ReportCardParseErrors

    constructor(
        attachAgentConversations: AttachAgentConversations,
        activeCardsChanged: ActiveCardsChanged,
        reportCardParseErrors = ignoreCardParseErrors,
    ) {
        this.attachAgentConversations = attachAgentConversations
        this.activeCardsChanged = activeCardsChanged
        this.reportCardParseErrors = reportCardParseErrors
    }

    get files() { return this.currentFiles }
    get project() { return this.currentProject }
    get snapshot() { return this.currentSnapshot }
    get commitPathsInFlight() { return this.inFlightCommitPaths }
    get agentConversationToken() { return this.agentConversationLoadToken }
    get projectToken() { return this.projectLoadToken }

    resetLoadedProject() {
        const previousActiveCards = this.currentSnapshot?.activeCards ?? []
        this.currentFiles = []
        this.currentProject = null
        this.currentSnapshot = null
        this.inFlightCommitPaths.clear()
        this.committedContentHashByPath.clear()
        this.cardCacheByPath.clear()
        this.parseErrorPaths.clear()
        if (previousActiveCards.length > 0) this.activeCardsChanged(previousActiveCards, [])
    }

    replaceProject(project: ProjectReference | null) {
        this.currentProject = project
    }

    replaceProjectFiles(files: MarkdownFile[], workingFolder: string, repositoryFiles: string[]) {
        const previousActiveCards = this.currentSnapshot?.activeCards ?? []
        this.currentFiles = files
        this.currentSnapshot = this.createSnapshot(files, workingFolder, repositoryFiles)
        if (previousActiveCards !== this.currentSnapshot.activeCards) {
            this.activeCardsChanged(previousActiveCards, this.currentSnapshot.activeCards)
        }
    }

    replaceFiles(files: MarkdownFile[], workingFolder: string) {
        const repositoryFiles = this.currentSnapshot?.repositoryFiles ?? []
        this.replaceProjectFiles(files, workingFolder, repositoryFiles)
    }

    mergeCommittedFiles(files: MarkdownFile[], workingFolder: string) {
        this.replaceFiles(mergeFiles(this.currentFiles, files), workingFolder)
    }

    /** Remembers what was written to disk so the watcher echo of our own commit can be recognized. */
    recordCommittedContent(files: MarkdownFile[]) {
        files.forEach((file) => this.committedContentHashByPath.set(file.path, hashContent(file.content)))
    }

    isCommittedContent(path: string, content: string) {
        return this.committedContentHashByPath.get(path) === hashContent(content)
    }

    /** Merges successful companion writes and removes a deleted file from one rebuilt snapshot. */
    deleteFile(path: string, committedFiles: MarkdownFile[], workingFolder: string) {
        const files = mergeFiles(this.currentFiles, committedFiles).filter((file) => file.path !== path)
        const repositoryFiles = (this.currentSnapshot?.repositoryFiles ?? []).filter((filePath) => filePath !== path)
        this.committedContentHashByPath.delete(path)

        this.replaceProjectFiles(files, workingFolder, repositoryFiles)
    }

    /** Moves a loaded file and its repository entry to a committed path. */
    renameFile(fromPath: string, toPath: string, workingFolder: string) {
        if (fromPath === toPath) return

        const movedHash = this.committedContentHashByPath.get(fromPath)
        this.committedContentHashByPath.delete(fromPath)
        if (movedHash !== undefined) this.committedContentHashByPath.set(toPath, movedHash)

        const sourceFile = this.currentFiles.find((file) => file.path === fromPath)
        const targetFile = this.currentFiles.find((file) => file.path === toPath)
        const movedFile = sourceFile ? { ...targetFile, ...sourceFile, path: toPath } : targetFile
        const files = this.currentFiles.filter((file) => file.path !== fromPath && file.path !== toPath)
        const repositoryFiles = this.currentSnapshot?.repositoryFiles ?? []
        const nextRepositoryFiles = repositoryFiles.includes(fromPath) || repositoryFiles.includes(toPath)
            ? [...repositoryFiles.filter((path) => path !== fromPath && path !== toPath), toPath]
            : repositoryFiles

        this.replaceProjectFiles(movedFile ? [...files, movedFile] : files, workingFolder, nextRepositoryFiles)
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
        const previousActiveCards = this.currentSnapshot?.activeCards ?? []
        const repositoryFiles = this.currentSnapshot?.repositoryFiles ?? []
        this.currentSnapshot = this.createSnapshot(this.currentFiles, workingFolder, repositoryFiles)
        if (previousActiveCards !== this.currentSnapshot.activeCards) {
            this.activeCardsChanged(previousActiveCards, this.currentSnapshot.activeCards)
        }
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

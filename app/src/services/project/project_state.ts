import type { CanonicalCard, MarkdownFile, ProjectCard, ProjectReference, ProjectSnapshot } from '../../data/data_types'
import { markdownParsingService, type CardParseError } from '../data/markdown_parsing_service'
import { mergeFiles } from '../data/data_service_context'

type CardCollections = Pick<ProjectSnapshot, 'activeCards' | 'backgroundCards'>

type AttachAgentConversations = (cards: CardCollections) => CardCollections
type ReportCardParseErrors = (errors: CardParseError[]) => void
type ActiveCardsChanged = (previousCards: ProjectCard[], nextCards: ProjectCard[]) => void

const ignoreCardParseErrors: ReportCardParseErrors = () => undefined

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

function cloneHeaderFields(card: ProjectCard) {
    return Object.fromEntries(Object.entries(card.headerFields).map(([key, value]) => {
        if (Array.isArray(value)) return [key, [...value]]
        if (typeof value === 'object') return [key, { ...value }]

        return [key, value]
    }))
}

function cloneCard(card: ProjectCard): ProjectCard {
    return {
        ...card,
        agentConversationErrors: [...card.agentConversationErrors],
        agentConversations: [...card.agentConversations],
        header: {
            ...card.header,
            affects: [...card.header.affects],
            agentLogReferences: [...card.header.agentLogReferences],
            policy: { ...card.header.policy },
        },
        headerFields: cloneHeaderFields(card),
    }
}

export class ProjectState {
    private agentConversationLoadToken = 0
    private currentFiles: MarkdownFile[] = []
    private currentCardsByPath = new Map<string, CanonicalCard>()
    private currentProject: ProjectReference | null = null
    private currentSnapshot: ProjectSnapshot | null = null
    private readonly inFlightCommitPaths: Set<string> = new Set()
    private readonly committedContentHashByPath = new Map<string, number>()
    private projectLoadToken = 0
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
        this.currentCardsByPath.clear()
        this.currentProject = null
        this.currentSnapshot = null
        this.inFlightCommitPaths.clear()
        this.committedContentHashByPath.clear()
        this.parseErrorPaths.clear()
        if (previousActiveCards.length > 0) this.activeCardsChanged(previousActiveCards, [])
    }

    replaceProject(project: ProjectReference | null) {
        this.currentProject = project
    }

    replaceProjectFiles(files: MarkdownFile[], workingFolder: string, repositoryFiles: string[]) {
        const previousActiveCards = this.currentSnapshot?.activeCards ?? []
        this.currentFiles = files
        this.reconcileCards(files, workingFolder)
        this.currentSnapshot = this.createSnapshot(workingFolder, repositoryFiles, true)
        if (previousActiveCards !== this.currentSnapshot.activeCards) {
            this.activeCardsChanged(previousActiveCards, this.currentSnapshot.activeCards)
        }
    }

    replaceFiles(files: MarkdownFile[], workingFolder: string) {
        const repositoryFiles = this.currentSnapshot?.repositoryFiles ?? []
        this.replaceProjectFiles(files, workingFolder, repositoryFiles)
    }

    mergeCommittedFiles(files: MarkdownFile[], workingFolder: string) {
        for (const file of files) {
            const card = this.currentCardsByPath.get(file.path)
            if (card) {
                markdownParsingService.acknowledgeSerializedCard(card, file)
                card.sha = file.sha ?? card.sha
            }
        }
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

        this.currentFiles = movedFile ? [...files, movedFile] : files
        const movedCard = this.currentCardsByPath.get(fromPath)
        const previousCard = movedCard ? cloneCard(movedCard) : null
        const previousActiveCards = this.currentSnapshot?.activeCards ?? []
        this.currentCardsByPath.delete(fromPath)
        this.currentCardsByPath.delete(toPath)
        if (movedCard) {
            movedCard.path = toPath
            movedCard.isActive = markdownParsingService.isRootWorkingFolderFile(toPath, workingFolder)
            this.currentCardsByPath.set(toPath, movedCard)
        }
        this.currentSnapshot = this.createSnapshot(workingFolder, nextRepositoryFiles)
        if (previousCard?.isActive) {
            const eventCards = previousActiveCards.map((candidate) => candidate === movedCard ? previousCard : candidate)
            this.activeCardsChanged(eventCards, this.currentSnapshot.activeCards)
        } else if (previousActiveCards !== this.currentSnapshot.activeCards) {
            this.activeCardsChanged(previousActiveCards, this.currentSnapshot.activeCards)
        }
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

    requireCard(path: string): CanonicalCard {
        const card = this.currentCardsByPath.get(path)
        if (!card) throw new Error(`Cannot update a card that is not loaded: ${path}`)

        return card
    }

    mutateCard(path: string, mutation: (card: CanonicalCard) => void, workingFolder: string) {
        const card = this.requireCard(path)
        const previousCard = cloneCard(card)
        const previousActiveCards = this.currentSnapshot?.activeCards ?? []
        mutation(card)
        const repositoryFiles = this.currentSnapshot?.repositoryFiles ?? []
        this.currentSnapshot = this.createSnapshot(workingFolder, repositoryFiles, true)

        if (previousCard.isActive) {
            const eventCards = previousActiveCards.map((candidate) => candidate === card ? previousCard : candidate)
            this.activeCardsChanged(eventCards, this.currentSnapshot.activeCards)
        }

        return card
    }

    refreshSnapshot(workingFolder: string) {
        const previousActiveCards = this.currentSnapshot?.activeCards ?? []
        const repositoryFiles = this.currentSnapshot?.repositoryFiles ?? []
        this.currentSnapshot = this.createSnapshot(workingFolder, repositoryFiles, true)
        if (previousActiveCards !== this.currentSnapshot.activeCards) {
            this.activeCardsChanged(previousActiveCards, this.currentSnapshot.activeCards)
        }
    }

    private createSnapshot(workingFolder: string, repositoryFiles: string[], forceNew = false): ProjectSnapshot {
        const canonicalCards = [...this.currentCardsByPath.values()]
        const cards = this.attachAgentConversations({
            activeCards: canonicalCards.filter(({ isActive }) => isActive),
            backgroundCards: canonicalCards.filter(({ isActive }) => !isActive),
        })
        const activeCards = cards.activeCards
        const backgroundCards = cards.backgroundCards

        const previous = this.currentSnapshot
        const snapshot: ProjectSnapshot = {
            activeCards: !forceNew && previous && isSameArray(previous.activeCards, activeCards) ? previous.activeCards : activeCards,
            backgroundCards: !forceNew && previous && isSameArray(previous.backgroundCards, backgroundCards)
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

        return !forceNew && isSameSnapshot ? previous : snapshot
    }

    private reconcileCards(files: MarkdownFile[], workingFolder: string) {
        const nextCardsByPath = new Map<string, CanonicalCard>()
        const parseErrors: CardParseError[] = []

        for (const file of files) {
            if (!markdownParsingService.isMarkdownFile(file.path)) continue

            const existingCard = this.currentCardsByPath.get(file.path)
            if (existingCard?.source.content === file.content) {
                existingCard.sha = file.sha
                existingCard.isActive = markdownParsingService.isRootWorkingFolderFile(file.path, workingFolder)
                nextCardsByPath.set(file.path, existingCard)
                continue
            }

            try {
                nextCardsByPath.set(file.path, markdownParsingService.parseCard(file, workingFolder))
            } catch (error) {
                parseErrors.push({ error, path: file.path })
            }
        }

        const newParseErrors = parseErrors.filter(({ path }) => !this.parseErrorPaths.has(path))
        this.parseErrorPaths = new Set(parseErrors.map(({ path }) => path))
        if (newParseErrors.length > 0) this.reportCardParseErrors(newParseErrors)
        this.currentCardsByPath = nextCardsByPath
    }
}

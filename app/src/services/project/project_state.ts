import type { Card, MarkdownFile, MoveFile, ProjectReference, ProjectSnapshot, ProjectWatchEvent } from '../../data/data_types'
import { markdownParsingService, type CardParseError } from '../data/markdown_parsing_service'
import { mergeFiles } from '../data/data_service_context'

type AttachAgentConversations = (card: Card) => Card
type ReportCardParseErrors = (errors: CardParseError[]) => void
type ActiveCardsChanged = (previousCards: Card[], nextCards: Card[]) => void

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

function cloneCard(card: Card): Card {
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
    }
}

export class ProjectState {
    private currentFiles: MarkdownFile[] = []
    private currentCardsByPath = new Map<string, Card>()
    private currentProject: ProjectReference | null = null
    private currentSnapshot: ProjectSnapshot | null = null
    private readonly inFlightCommitPaths: Set<string> = new Set()
    private readonly currentContentHashByPath = new Map<string, number>()
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
    get projectToken() { return this.projectLoadToken }

    resetLoadedProject() {
        const previousActiveCards = this.currentSnapshot?.activeCards ?? []
        this.currentFiles = []
        this.currentCardsByPath.clear()
        this.currentProject = null
        this.currentSnapshot = null
        this.inFlightCommitPaths.clear()
        this.currentContentHashByPath.clear()
        this.parseErrorPaths.clear()
        if (previousActiveCards.length > 0) this.activeCardsChanged(previousActiveCards, [])
    }

    replaceProject(project: ProjectReference | null) {
        this.currentProject = project
    }

    replaceProjectFiles(files: MarkdownFile[], workingFolder: string, repositoryFiles: string[]) {
        const previousActiveCards = this.currentSnapshot?.activeCards ?? []
        this.currentFiles = files
        this.replaceCurrentContentHashes(files)
        this.reconcileCards(files, workingFolder)
        this.currentSnapshot = this.createSnapshot(workingFolder, repositoryFiles, true)
        if (previousActiveCards !== this.currentSnapshot.activeCards) {
            this.activeCardsChanged(previousActiveCards, this.currentSnapshot.activeCards)
        }
    }

    /** Adds files discovered by the full load without replacing cards already owned by the root snapshot. */
    mergeBackgroundProjectFiles(files: MarkdownFile[], workingFolder: string, repositoryFiles: string[]) {
        const previousActiveCards = this.currentSnapshot?.activeCards ?? []
        this.currentFiles = files
        this.replaceCurrentContentHashes(files)
        this.reconcileCards(this.currentFiles, workingFolder, true)
        this.currentSnapshot = this.createSnapshot(workingFolder, repositoryFiles)
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

    /** Parses and applies only changed files while preserving every unaffected card. */
    updateFiles(updatedFiles: MarkdownFile[], removedPaths: string[], workingFolder: string) {
        const removedPathSet = new Set(removedPaths)
        const updatedPathSet = new Set(updatedFiles.map(({ path }) => path))
        const changedPathSet = new Set([...removedPaths, ...updatedPathSet])
        const previousActiveCards = this.currentSnapshot?.activeCards ?? []
        const previousBackgroundCards = this.currentSnapshot?.backgroundCards ?? []
        this.currentFiles = [
            ...this.currentFiles.filter(({ path }) => !removedPathSet.has(path) && !updatedPathSet.has(path)),
            ...updatedFiles,
        ]
        removedPaths.forEach((path) => {
            this.currentCardsByPath.delete(path)
            this.currentContentHashByPath.delete(path)
            this.parseErrorPaths.delete(path)
        })
        for (const file of updatedFiles) this.updateCardFromFile(file, workingFolder)
        this.recordCurrentContent(updatedFiles)
        const updatedCards = updatedFiles
            .map(({ path }) => this.currentCardsByPath.get(path))
            .filter((card): card is Card => !!card)
        const activeCards = [
            ...previousActiveCards.filter(({ path }) => !changedPathSet.has(path)),
            ...updatedCards.filter(({ isActive }) => isActive),
        ]
        const backgroundCards = [
            ...previousBackgroundCards.filter(({ path }) => !changedPathSet.has(path)),
            ...updatedCards.filter(({ isActive }) => !isActive),
        ]
        const nextActiveCards = isSameArray(previousActiveCards, activeCards) ? previousActiveCards : activeCards
        const nextBackgroundCards = isSameArray(previousBackgroundCards, backgroundCards)
            ? previousBackgroundCards
            : backgroundCards
        this.currentSnapshot = {
            activeCards: nextActiveCards,
            backgroundCards: nextBackgroundCards,
            repositoryFiles: this.currentSnapshot?.repositoryFiles ?? [],
            workingFolder,
        }
        if (previousActiveCards !== nextActiveCards) this.activeCardsChanged(previousActiveCards, nextActiveCards)
    }

    /** Applies known repository moves without rereading unrelated project files. */
    applyMoves(moves: MoveFile[], workingFolder: string) {
        const sourcePaths = moves.map(({ fromPath }) => fromPath)
        const loadedPathSet = new Set(this.currentFiles.map(({ path }) => path))
        const loadedSourcePaths = sourcePaths.filter((path) => loadedPathSet.has(path))
        const movedFiles = moves
            .filter(({ fromPath }) => loadedPathSet.has(fromPath))
            .map(({ content, encoding, sha, toPath }) => ({ content, encoding, path: toPath, sha }))
        this.updateFiles(movedFiles, loadedSourcePaths, workingFolder)
        const sourcePathSet = new Set(sourcePaths)
        const repositoryFiles = this.currentSnapshot?.repositoryFiles ?? []
        const movedRepositoryFiles = [
            ...repositoryFiles.filter((path) => !sourcePathSet.has(path)),
            ...moves.map(({ toPath }) => toPath),
        ]
        this.currentSnapshot = { ...this.currentSnapshot!, repositoryFiles: [...new Set(movedRepositoryFiles)].sort() }
    }

    updateRepositoryFile(event: ProjectWatchEvent) {
        if (!this.currentSnapshot) return
        const repositoryFiles = event.changeKind === 'removed'
            ? this.currentSnapshot.repositoryFiles.filter((path) => path !== event.path)
            : this.currentSnapshot.repositoryFiles.includes(event.path)
                ? this.currentSnapshot.repositoryFiles
                : [...this.currentSnapshot.repositoryFiles, event.path].sort()
        if (repositoryFiles === this.currentSnapshot.repositoryFiles) return

        this.currentSnapshot = { ...this.currentSnapshot, repositoryFiles }
    }

    addRepositoryFile(path: string) {
        this.updateRepositoryFile({ changeKind: 'added', path })
    }

    removeFolder(path: string, workingFolder: string) {
        const prefix = `${path.replace(/\/+$/u, '')}/`
        const removedPaths = this.currentFiles.filter((file) => file.path.startsWith(prefix)).map((file) => file.path)
        this.updateFiles([], removedPaths, workingFolder)
        if (!this.currentSnapshot) return

        this.currentSnapshot = {
            ...this.currentSnapshot,
            repositoryFiles: this.currentSnapshot.repositoryFiles.filter((filePath) => !filePath.startsWith(prefix)),
        }
    }

    refreshCardConversations(path: string, workingFolder: string) {
        const card = this.requireCard(path)
        const previousCard = cloneCard(card)
        const previousActiveCards = this.currentSnapshot?.activeCards ?? []
        this.attachAgentConversations(card)
        if (this.currentSnapshot) this.currentSnapshot = { ...this.currentSnapshot, workingFolder }
        if (previousCard.isActive) {
            const eventCards = previousActiveCards.map((candidate) => candidate === card ? previousCard : candidate)
            this.activeCardsChanged(eventCards, previousActiveCards)
        }
    }

    /** Updates current content before delayed watcher echoes can arrive. */
    recordCurrentContent(files: MarkdownFile[]) {
        files.forEach((file) => this.currentContentHashByPath.set(file.path, hashContent(file.content)))
    }

    matchesCurrentContent(path: string, content: string) {
        return this.currentContentHashByPath.get(path) === hashContent(content)
    }

    /** Merges successful companion writes and removes a deleted file from one rebuilt snapshot. */
    deleteFile(path: string, committedFiles: MarkdownFile[], workingFolder: string) {
        const files = mergeFiles(this.currentFiles, committedFiles).filter((file) => file.path !== path)
        const repositoryFiles = (this.currentSnapshot?.repositoryFiles ?? []).filter((filePath) => filePath !== path)
        this.currentContentHashByPath.delete(path)

        this.replaceProjectFiles(files, workingFolder, repositoryFiles)
    }

    /** Moves a loaded file and its repository entry to a committed path. */
    renameFile(fromPath: string, toPath: string, workingFolder: string) {
        if (fromPath === toPath) return

        const movedHash = this.currentContentHashByPath.get(fromPath)
        this.currentContentHashByPath.delete(fromPath)
        // A commit that moved the file already recorded what it wrote, so only fill an unknown target.
        if (movedHash !== undefined && !this.currentContentHashByPath.has(toPath)) {
            this.currentContentHashByPath.set(toPath, movedHash)
        }

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

    requireFile(path: string): MarkdownFile {
        const existingFile = this.currentFiles.find((currentFile) => currentFile.path === path)
        if (!existingFile) throw new Error(`Cannot update a card that is not loaded: ${path}`)

        return existingFile
    }

    requireCard(path: string): Card {
        const card = this.currentCardsByPath.get(path)
        if (!card) throw new Error(`Cannot update a card that is not loaded: ${path}`)

        return card
    }

    findCardByInternalId(internalId: string): Card | null {
        return [...this.currentCardsByPath.values()].find(({ header }) => header.internalId === internalId) ?? null
    }

    requireCardByInternalId(internalId: string): Card {
        const card = this.findCardByInternalId(internalId)
        if (!card) throw new Error(`Cannot update a card that is not loaded: ${internalId}`)

        return card
    }

    mutateCard(path: string, mutation: (card: Card) => void, workingFolder: string) {
        const card = this.requireCard(path)
        const previousCard = cloneCard(card)
        const previousActiveCards = this.currentSnapshot?.activeCards ?? []
        mutation(card)
        if (this.currentSnapshot) this.currentSnapshot = { ...this.currentSnapshot, workingFolder }

        if (previousCard.isActive) {
            const eventCards = previousActiveCards.map((candidate) => candidate === card ? previousCard : candidate)
            this.activeCardsChanged(eventCards, previousActiveCards)
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
        const cards = [...this.currentCardsByPath.values()]
        const activeCards = cards.filter(({ isActive }) => isActive)
        const backgroundCards = cards.filter(({ isActive }) => !isActive)

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

    private reconcileCards(files: MarkdownFile[], workingFolder: string, preserveExisting = false) {
        const nextCardsByPath = new Map<string, Card>()
        const parseErrors: CardParseError[] = []

        for (const file of files) {
            if (!markdownParsingService.isMarkdownFile(file.path)) continue

            const existingCard = this.currentCardsByPath.get(file.path)
            if (preserveExisting && existingCard) {
                nextCardsByPath.set(file.path, existingCard)
                continue
            }
            if (existingCard && markdownParsingService.hasSourceContent(existingCard, file.content)) {
                existingCard.sha = file.sha
                existingCard.isActive = markdownParsingService.isRootWorkingFolderFile(file.path, workingFolder)
                nextCardsByPath.set(file.path, existingCard)
                continue
            }

            try {
                const card = markdownParsingService.parseCard(file, workingFolder)
                nextCardsByPath.set(file.path, this.attachAgentConversations(card))
            } catch (error) {
                parseErrors.push({ error, path: file.path })
            }
        }

        const newParseErrors = parseErrors.filter(({ path }) => !this.parseErrorPaths.has(path))
        this.parseErrorPaths = new Set(parseErrors.map(({ path }) => path))
        if (newParseErrors.length > 0) this.reportCardParseErrors(newParseErrors)
        this.currentCardsByPath = nextCardsByPath
    }

    private updateCardFromFile(file: MarkdownFile, workingFolder: string) {
        if (!markdownParsingService.isMarkdownFile(file.path)) return
        const existingCard = this.currentCardsByPath.get(file.path)
        if (existingCard && markdownParsingService.hasSourceContent(existingCard, file.content)) {
            existingCard.sha = file.sha
            existingCard.isActive = markdownParsingService.isRootWorkingFolderFile(file.path, workingFolder)
            return
        }

        try {
            const card = markdownParsingService.parseCard(file, workingFolder)
            this.currentCardsByPath.set(file.path, this.attachAgentConversations(card))
            this.parseErrorPaths.delete(file.path)
        } catch (error) {
            this.currentCardsByPath.delete(file.path)
            if (!this.parseErrorPaths.has(file.path)) this.reportCardParseErrors([{ error, path: file.path }])
            this.parseErrorPaths.add(file.path)
        }
    }

    private replaceCurrentContentHashes(files: MarkdownFile[]) {
        this.currentContentHashByPath.clear()
        this.recordCurrentContent(files)
    }
}

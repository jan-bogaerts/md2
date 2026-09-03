import { describe, expect, it, vi } from 'vitest'
import { BUILTIN_CUSTOM_PROMPT, type ActionDefinition } from '../data/action_types'
import type { Card, ProjectSnapshot } from '../data/data_types'
import { getService } from './service_injector'
import { OpenFilesService, type OpenDocumentEventDetail } from './open_files_service'
import { editableActionDefinition, type ActionDraftState, type ActionService } from './actions/action_service'
import { ACTIONS_CHANGED_EVENT } from './actions/action_service_events'
import { CARD_CHANGED_EVENT, type CardChangedEventDetail } from './data/data_service'

function card(internalId: string, path = `design/${internalId}.md`, content = `# ${internalId}`): Card {
    return {
        agentConversationErrors: [], agentConversations: [], content,
        header: {
            affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id: internalId.toUpperCase(), internalId,
            owner: null, policy: {}, references: [], status: 'todo', title: internalId, worktree: null,
        },
        hasFrontmatter:true,
        isActive: true,
        path,
    }
}

function action(id: string, sourcePath = `actions/${id}.json`, label = id): ActionDefinition {
    return {
        agent: null, appliesTo: null, permissionMode: null, builtin: false, command: null,
        description: id, icon: null, id, label,
        model: null, needsWorkTree: false, on: [], onAfter: [], onBefore: [], onState: null, output: null, phrases: [],
        prompt: id, showCommandWindow: false, sourcePath, thinkingLevel: null,
        trackFileChanges: false, streaming: false, type: 'agent',
    }
}

function owners(initialCards: Card[] = [], initialActions: ActionDefinition[] = []) {
    let snapshot: ProjectSnapshot = { activeCards: initialCards, backgroundCards: [], repositoryFiles: [], workingFolder: 'design' }
    let actions = initialActions
    const dataOwner = Object.assign(new EventTarget(), {getState: () => ({ project: { branch: 'main', id: 'project' }, runningAgents: [], snapshot })})
    const actionOwner = Object.assign(new EventTarget(), {
        getActions: () => actions,
        draftStore: {
            getDeletedDraftActions: () => [],
            getDraft: (actionId: string): ActionDraftState => {
                const actionDefinition = actions.find((candidate) => candidate.id === actionId)
                if (!actionDefinition?.sourcePath) throw new Error(`Missing action: ${actionId}`)
                return {
                    conflict: null, definition: editableActionDefinition(actionDefinition), deleted: false, error: null,
                    revision: 0, savedRevision: 0,
                    saving: false, sourcePath: actionDefinition.sourcePath, targetPath: actionDefinition.sourcePath,
                    validation: { code: null, error: null, field: null, fieldPath: null, index: null, valid: true },
                }
            },
        },
    }) as unknown as EventTarget & Pick<ActionService, 'getActions' | 'draftStore'>

    return {
        actionOwner,
        dataOwner,
        renewActions: (nextActions: ActionDefinition[]) => {
            actions = nextActions
            actionOwner.dispatchEvent(new CustomEvent(ACTIONS_CHANGED_EVENT))
        },
        renewCards: (nextCards: Card[]) => {
            snapshot = { ...snapshot, activeCards: nextCards }
            dataOwner.dispatchEvent(new CustomEvent('changed', { detail: dataOwner.getState() }))
        },
        renewCard: (nextCard: Card) => {
            const previousCard = snapshot.activeCards.find((candidate) => candidate.header.internalId === nextCard.header.internalId)
            if (!previousCard) throw new Error(`Missing previous card: ${nextCard.header.internalId}`)

            snapshot = {
                ...snapshot,
                activeCards: snapshot.activeCards.map((candidate) => (
                    candidate.header.internalId === nextCard.header.internalId ? nextCard : candidate
                )),
            }
            const eventCard = { ...nextCard, header: { ...nextCard.header } }
            const detail: CardChangedEventDetail = { card: eventCard, previousCard }
            dataOwner.dispatchEvent(new CustomEvent<CardChangedEventDetail>(CARD_CHANGED_EVENT, { detail }))
        },
    }
}

describe('OpenFilesService', () => {
    it('keeps one stable wrapper while card metadata and path renew', () => {
        const firstCard = card('card-1')
        const ownerState = owners([firstCard])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })
        const changed = vi.fn()
        service.addEventListener('changed', changed)
        const document = service.openDocument(firstCard)
        changed.mockClear()

        const renamedCard = card('card-1', 'design/renamed.md')
        ownerState.renewCards([renamedCard])

        expect(service.getSnapshot()).toEqual({ activeDocument: document, documents: [document] })
        expect(document.getObject()).toBe(renamedCard)
        expect(changed).toHaveBeenCalledOnce()
    })

    it('renews only the changed card document from a granular card event', () => {
        const firstCard = card('card-1')
        const secondCard = card('card-2')
        const ownerState = owners([firstCard, secondCard])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })
        const firstDocument = service.openDocument(firstCard)
        const secondDocument = service.openDocument(secondCard)
        const firstChanged = vi.fn()
        const secondChanged = vi.fn()
        firstDocument.addEventListener('changed', firstChanged)
        secondDocument.addEventListener('changed', secondChanged)

        const movedCard = { ...firstCard, header: { ...firstCard.header, status: 'done' } }
        ownerState.renewCard(movedCard)

        expect(firstDocument.getObject()).toBe(movedCard)
        expect(firstChanged).toHaveBeenCalled()
        expect(secondChanged).not.toHaveBeenCalled()
    })

    it('opens a regular markdown file without an internal ID and identifies it by path', () => {
        const plainFile = card('notes', 'design/architecture/notes.md')
        plainFile.header.internalId = null
        const ownerState = owners([plainFile])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })

        const document = service.openDocument(plainFile)
        const renewedFile = { ...plainFile, content: '# Notes renewed' }
        ownerState.renewCards([renewedFile])

        expect(document.path).toBe('design/architecture/notes.md')
        expect(service.getSnapshot().documents).toEqual([document])
        expect(document.getObject()).toBe(renewedFile)
        expect(() => service.openBoardDocument(plainFile)).toThrow('Card identity was not added before opening')
    })

    it('does not publish a Markdown replacement when only a dirty document object renews', () => {
        const firstCard = card('card-1')
        const ownerState = owners([firstCard])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })
        const document = service.openDocument(firstCard)
        if (document.kind !== 'card') throw new Error('Expected card document')
        document.updateDraft({ content: '# local' }, 'list-card')
        const eventTypes: string[] = []
        document.addEventListener('changed', (event) => {
            eventTypes.push((event as CustomEvent<{ type: string }>).detail.type)
        })

        ownerState.renewCards([{ ...firstCard, header: { ...firstCard.header, title: 'Published title' } }])

        expect(eventTypes).toEqual(['renewed'])
        expect(document.getDraft().content).toBe('# local')
    })

    it('retains an action document across path rename', () => {
        const firstAction = action('review')
        const ownerState = owners([], [firstAction])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })
        const document = service.openDocument(firstAction)
        const changed = vi.fn()
        service.addEventListener('changed', changed)

        const renamedAction = action('review', 'actions/review-code.json', 'Review code')
        ownerState.renewActions([renamedAction])

        expect(service.getSnapshot().activeDocument).toBe(document)
        expect(document.getObject()).toBe(renamedAction)
        expect(changed).toHaveBeenCalledOnce()
    })

    it('activates and closes by wrapper identity', () => {
        const firstCard = card('one')
        const secondCard = card('two')
        const ownerState = owners([firstCard, secondCard])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })
        const firstDocument = service.openDocument(firstCard)
        const secondDocument = service.openDocument(secondCard)
        const removed = vi.fn()
        service.addEventListener('removed', removed)

        service.activateDocument(firstDocument)
        service.closeDocument(firstDocument)

        expect(service.getSnapshot()).toEqual({ activeDocument: secondDocument, documents: [secondDocument] })
        expect((removed.mock.calls[0][0] as CustomEvent<OpenDocumentEventDetail>).detail.document).toBe(firstDocument)
    })

    it('shares one card document between board and list memberships', () => {
        const Card = card('shared')
        const ownerState = owners([Card])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })

        const listDocument = service.openDocument(Card)
        const boardDocument = service.openBoardDocument(Card)
        if (listDocument.kind !== 'card') throw new Error('Expected card document')
        boardDocument.updateDraft({ content: '# shared edit' }, null)

        expect(boardDocument).toBe(listDocument)
        expect(listDocument.getDraft().content).toBe('# shared edit')
        expect(Card.content).toBe('# shared')
        service.closeBoardDocument(boardDocument)
        expect(service.getRegisteredDocuments()).toContain(listDocument)
    })

    it('retains a dirty document after its last view closes and releases it after save', () => {
        const Card = card('recoverable')
        const ownerState = owners([Card])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })
        const document = service.openDocument(Card)
        if (document.kind !== 'card') throw new Error('Expected card document')
        document.updateDraft({ content: '# unsaved' })
        const saveReference = document.createSaveReference()

        service.closeDocument(document)
        expect(service.getRegisteredDocuments()).toEqual([document])

        saveReference.acknowledge()
        expect(service.getRegisteredDocuments()).toEqual([])
    })

    it('creates a fresh wrapper after a saved document is fully released and reopened', () => {
        const Card = card('reopen')
        const ownerState = owners([Card])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })
        const firstDocument = service.openDocument(Card)

        service.closeDocument(firstDocument)
        const reopenedDocument = service.openDocument(Card)

        expect(reopenedDocument).not.toBe(firstDocument)
        expect(reopenedDocument.dirty).toBe(false)
    })

    it('does not clear an edit newer than an acknowledged save revision', () => {
        const Card = card('revision')
        const ownerState = owners([Card])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })
        const document = service.openDocument(Card)
        if (document.kind !== 'card') throw new Error('Expected card document')
        document.updateDraft({ content: '# first' })
        const firstSave = document.createSaveReference()
        document.updateDraft({ content: '# second' })

        firstSave.acknowledge()
        expect(document.dirty).toBe(true)

        document.createSaveReference().acknowledge()
        expect(document.dirty).toBe(false)
    })

    it('resolves and opens current documents by path while skipping source-less built-in actions', () => {
        const Card = card('one')
        const reviewAction = action('review')
        const ownerState = owners([Card], [BUILTIN_CUSTOM_PROMPT, reviewAction])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })

        const cardDocument = service.openPath(Card.path)
        const actionDocument = service.openPath(reviewAction.sourcePath ?? '')

        expect(cardDocument.getObject()).toBe(Card)
        expect(actionDocument.getObject()).toBe(reviewAction)
        expect(service.getSnapshot().activeDocument).toBe(actionDocument)
    })

    it('fails when opening an unknown path', () => {
        const ownerState = owners()
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })

        expect(() => service.openPath('design/missing.md')).toThrow('Cannot open unknown document: design/missing.md')
    })

    it('reconciles deleted domain objects without a path-retention call', () => {
        const Card = card('one')
        const ownerState = owners([Card])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })
        service.openDocument(Card)

        ownerState.renewCards([])

        expect(service.getSnapshot()).toEqual({ activeDocument: null, documents: [] })
    })

    it('registers itself in service injector', () => {
        expect(getService('openFilesService')).toBeInstanceOf(OpenFilesService)
    })
})

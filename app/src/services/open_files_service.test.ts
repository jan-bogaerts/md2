import { describe, expect, it, vi } from 'vitest'
import { BUILTIN_CUSTOM_PROMPT, type ActionDefinition } from '../data/action_types'
import type { ProjectCard, ProjectSnapshot } from '../data/data_types'
import { getService } from './service_injector'
import { OpenFilesService, type OpenDocumentEventDetail } from './open_files_service'
import { editableActionDefinition, type ActionDraftState, type ActionService } from './actions/action_service'

function card(internalId: string, path = `design/${internalId}.md`, content = `# ${internalId}`): ProjectCard {
    return {
        agentConversationErrors: [], agentConversations: [], content,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: internalId.toUpperCase(), internalId,
            owner: null, policy: {}, status: 'todo', title: internalId, worktree: null,
        },
        headerFields: { id: internalId.toUpperCase() }, isActive: true, path,
    }
}

function action(id: string, sourcePath = `actions/${id}.json`, label = id): ActionDefinition {
    return {
        agent: null, appliesTo: null, builtin: false, command: null, description: id, icon: null, id, label,
        model: null, needsWorkTree: false, on: [], onAfter: [], onBefore: [], onState: null, phrases: [],
        prompt: id, sourcePath, thinkingLevel: null, trackFileChanges: false, type: 'agent',
    }
}

function owners(initialCards: ProjectCard[] = [], initialActions: ActionDefinition[] = []) {
    let snapshot: ProjectSnapshot = { activeCards: initialCards, backgroundCards: [], repositoryFiles: [], workingFolder: 'design' }
    let actions = initialActions
    const dataOwner = Object.assign(new EventTarget(), {getState: () => ({ project: { branch: 'main', id: 'project' }, runningAgents: [], snapshot })})
    const actionOwner = Object.assign(new EventTarget(), {
        getActions: () => actions,
        getDeletedDraftActions: () => [],
        getDraft: (path: string): ActionDraftState => {
            const actionDefinition = actions.find((candidate) => candidate.sourcePath === path)
            if (!actionDefinition) throw new Error(`Missing action: ${path}`)
            return {
                conflict: null, definition: editableActionDefinition(actionDefinition), deleted: false, error: null,
                revision: 0, savedRevision: 0,
                saving: false,
                validation: { code: null, error: null, field: null, fieldPath: null, index: null, valid: true },
            }
        },
    }) as unknown as EventTarget & Pick<ActionService, 'getActions' | 'getDeletedDraftActions' | 'getDraft'>

    return {
        actionOwner,
        dataOwner,
        renewActions: (nextActions: ActionDefinition[]) => {
            actions = nextActions
            actionOwner.dispatchEvent(new CustomEvent('changed'))
        },
        renewCards: (nextCards: ProjectCard[]) => {
            snapshot = { ...snapshot, activeCards: nextCards }
            dataOwner.dispatchEvent(new CustomEvent('changed', { detail: dataOwner.getState() }))
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

        const renamedCard = card('card-1', 'design/renamed.md')
        ownerState.renewCards([renamedCard])

        expect(service.getSnapshot()).toEqual({ activeDocument: document, documents: [document] })
        expect(document.getObject()).toBe(renamedCard)
        expect(changed).toHaveBeenCalledOnce()
    })

    it('does not publish a Markdown replacement when only a dirty document object renews', () => {
        const firstCard = card('card-1')
        const ownerState = owners([firstCard])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })
        const document = service.openDocument(firstCard)
        if (document.kind !== 'card') throw new Error('Expected card document')
        document.updateDraft({ ...firstCard, content: '# local' }, 'list-card')
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

        const renamedAction = action('review', 'actions/review-code.json', 'Review code')
        ownerState.renewActions([renamedAction])

        expect(service.getSnapshot().activeDocument).toBe(document)
        expect(document.getObject()).toBe(renamedAction)
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
        const projectCard = card('shared')
        const ownerState = owners([projectCard])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })

        const listDocument = service.openDocument(projectCard)
        const boardDocument = service.openBoardDocument(projectCard)
        if (listDocument.kind !== 'card') throw new Error('Expected card document')
        boardDocument.updateDraft({ ...projectCard, content: '# shared edit' }, null)

        expect(boardDocument).toBe(listDocument)
        expect(listDocument.getDraft().content).toBe('# shared edit')
        service.closeBoardDocument(boardDocument)
        expect(service.getRegisteredDocuments()).toContain(listDocument)
    })

    it('retains a dirty document after its last view closes and releases it after save', () => {
        const projectCard = card('recoverable')
        const ownerState = owners([projectCard])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })
        const document = service.openDocument(projectCard)
        if (document.kind !== 'card') throw new Error('Expected card document')
        document.updateDraft({ ...projectCard, content: '# unsaved' })
        const saveReference = document.createSaveReference()

        service.closeDocument(document)
        expect(service.getRegisteredDocuments()).toEqual([document])

        saveReference.acknowledge()
        expect(service.getRegisteredDocuments()).toEqual([])
    })

    it('creates a fresh wrapper after a saved document is fully released and reopened', () => {
        const projectCard = card('reopen')
        const ownerState = owners([projectCard])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })
        const firstDocument = service.openDocument(projectCard)

        service.closeDocument(firstDocument)
        const reopenedDocument = service.openDocument(projectCard)

        expect(reopenedDocument).not.toBe(firstDocument)
        expect(reopenedDocument.dirty).toBe(false)
    })

    it('does not clear an edit newer than an acknowledged save revision', () => {
        const projectCard = card('revision')
        const ownerState = owners([projectCard])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })
        const document = service.openDocument(projectCard)
        if (document.kind !== 'card') throw new Error('Expected card document')
        document.updateDraft({ ...projectCard, content: '# first' })
        const firstSave = document.createSaveReference()
        document.updateDraft({ ...projectCard, content: '# second' })

        firstSave.acknowledge()
        expect(document.dirty).toBe(true)

        document.createSaveReference().acknowledge()
        expect(document.dirty).toBe(false)
    })

    it('resolves and opens current documents by path while skipping source-less built-in actions', () => {
        const projectCard = card('one')
        const reviewAction = action('review')
        const ownerState = owners([projectCard], [BUILTIN_CUSTOM_PROMPT, reviewAction])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })

        const cardDocument = service.openPath(projectCard.path)
        const actionDocument = service.openPath(reviewAction.sourcePath ?? '')

        expect(cardDocument.getObject()).toBe(projectCard)
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
        const projectCard = card('one')
        const ownerState = owners([projectCard])
        const service = new OpenFilesService()
        service.init({ actionService: ownerState.actionOwner, dataService: ownerState.dataOwner })
        service.openDocument(projectCard)

        ownerState.renewCards([])

        expect(service.getSnapshot()).toEqual({ activeDocument: null, documents: [] })
    })

    it('registers itself in service injector', () => {
        expect(getService('openFilesService')).toBeInstanceOf(OpenFilesService)
    })
})

import { describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../data/action_types'
import type { ProjectCard, ProjectSnapshot } from '../data/data_types'
import { getService } from './service_injector'
import { OpenFilesService, type OpenDocumentEventDetail } from './open_files_service'

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
    })

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

    it('resolves and opens current documents by path', () => {
        const projectCard = card('one')
        const reviewAction = action('review')
        const ownerState = owners([projectCard], [reviewAction])
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

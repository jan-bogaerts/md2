import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, MarkdownFile, StorageProjectFiles } from '../../data/data_types'
import type { ActionRunEvent } from '../../data/action_run_types'
import { runElectronAction } from '../actions/electron_action_runner'
import { actionRunRegistry } from '../actions/action_run_registry'
import { configService } from '../config/config_service'
import { dialogService } from '../dialog_service'
import { worktreeService } from '../project/worktree_service'
import {
    actionAcknowledgementEvent,
    agentAcknowledgementService,
    cardAcknowledgementEvent,
    PROJECT_ACKNOWLEDGEMENT_EVENT,
} from './agent_acknowledgement_service'
import { cardAgentState } from './card_agent_state'
import { conversation, createDataService, createDeferred, createStorage, waitForWorkerTurn } from '../test_support/data_service_test_support'

vi.mock('../actions/electron_action_runner', () => ({ runElectronAction: vi.fn(async () => ({ changedPaths: [], logs: [], status: 'completed' })) }))

describe('AgentIntegration', () => {
    afterEach(() => {
        actionRunRegistry.stop()
        vi.useRealTimers()
        vi.mocked(runElectronAction).mockClear()
        delete window.md2Actions
        configService.clear()
    })

    it('subscribes to pin changes only during its active lifecycle', () => {
        const cleanup = vi.fn()
        const service = createDataService()
        const subscribe = vi.spyOn(service.conversationPins, 'subscribe').mockReturnValue(cleanup)

        expect(subscribe).not.toHaveBeenCalled()
        service.agents.startScheduledRunWatch()
        expect(subscribe).toHaveBeenCalledOnce()

        service.agents.reset()
        expect(cleanup).toHaveBeenCalledOnce()
        subscribe.mockRestore()
    })

    it('runs matching onState actions when a card changes to the configured state', async () => {
        configService.init()
        const moveFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: a\ntitle: A\nstatus: todo\n---\n\n# A', path: 'design/F-1-a.md' },
            { content: '---\nid: F-2\ninternalId: b\ntitle: B\nstatus: todo\nafter: a\n---\n\n# B', path: 'design/F-2-b.md' },
        ]
        const actionFile = {
            content: JSON.stringify({
                appliesTo: { type: 'feature' },
                command: 'run',
                description: 'Ready',
                id: 'action-ready',
                label: 'Ready',
                onState: 'ready',
                type: 'command',
            }),
            path: 'actions/ready.json',
        }
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => [actionFile]),
            loadProject: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.moveCard('design/F-2-b.md', 'ready', 0)

        expect(runElectronAction).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'action-ready' }),
            expect.objectContaining({ file: 'design/F-2-b.md', kind: 'card', state: 'ready', type: 'feature' }),
            {},
            undefined,
            false,
        )
    })

    it('runs onState agent actions with definition thinking level and no runtime override', async () => {
        configService.init()
        const moveFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: a\ntitle: A\nstatus: todo\n---\n\n# A', path: 'design/F-1-a.md' },
        ]
        const actionFile = {
            content: JSON.stringify({
                agent: 'codex',
                appliesTo: { type: 'feature' },
                description: 'Implement',
                id: 'action-implement',
                label: 'Implement',
                model: 'gpt-5.5',
                onState: 'ready',
                prompt: 'Implement {{card-file}}',
                thinkingLevel: 'high',
                type: 'agent',
            }),
            path: 'actions/implement.json',
        }
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => [actionFile]),
            loadProject: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.moveCard('design/F-1-a.md', 'ready', 0)

        expect(runElectronAction).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'action-implement', thinkingLevel: 'high' }),
            expect.objectContaining({ file: 'design/F-1-a.md', kind: 'card', state: 'ready', type: 'feature' }),
            {},
            undefined,
            false,
        )
    })

    it('surfaces failed onState actions on the moved card', async () => {
        configService.init()
        vi.mocked(runElectronAction).mockResolvedValueOnce({
            changedPaths: [],
            logs: [{
                actionId: 'ready-action',
                actionName: 'ready-action',
                command: 'run',
                message: 'Ready failed with exit code 1',
                phase: 'main',
                status: 'failed',
                stderr: 'bad',
                stdout: '',
            }],
            status: 'failed',
        })
        const moveFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: a\ntitle: A\nstatus: todo\n---\n\n# A', path: 'design/F-1-a.md' },
            { content: '---\nid: F-2\ninternalId: b\ntitle: B\nstatus: todo\nafter: a\n---\n\n# B', path: 'design/F-2-b.md' },
        ]
        const actionFile = {
            content: JSON.stringify({
                appliesTo: { type: 'feature' },
                command: 'run',
                description: 'Ready',
                id: 'action-ready',
                label: 'Ready',
                onState: 'ready',
                type: 'command',
            }),
            path: 'actions/ready.json',
        }
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => [actionFile]),
            loadProject: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.moveCard('design/F-2-b.md', 'ready', 0)

        await vi.waitFor(() => {
            const movedCard = service.getState().snapshot?.activeCards.find((card) => card.path === 'design/F-2-b.md')
            expect(movedCard?.agentConversationErrors).toEqual([
                { kind: 'onStateAction', message: 'Ready failed with exit code 1', path: 'action-ready' },
            ])
        })
    })

    it('keeps a failed onState action on its card after a rename changes the card path', async () => {
        configService.init()
        vi.mocked(runElectronAction).mockResolvedValueOnce({
            changedPaths: [],
            logs: [{
                actionId: 'ready-action',
                actionName: 'ready-action',
                command: 'run',
                message: 'Ready failed with exit code 1',
                phase: 'main',
                status: 'failed',
                stderr: 'bad',
                stdout: '',
            }],
            status: 'failed',
        })
        const moveFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: a\ntitle: A\nstatus: todo\n---\n\n# A', path: 'design/F-1-a.md' },
            { content: '---\nid: F-2\ninternalId: b\ntitle: B\nstatus: todo\nafter: a\n---\n\n# B', path: 'design/F-2-b.md' },
        ]
        const actionFile = {
            content: JSON.stringify({
                appliesTo: { type: 'feature' },
                command: 'run',
                description: 'Ready',
                id: 'action-ready',
                label: 'Ready',
                onState: 'ready',
                type: 'command',
            }),
            path: 'actions/ready.json',
        }
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => [actionFile]),
            loadProject: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.moveCard('design/F-2-b.md', 'ready', 0)
        await vi.waitFor(() => {
            const movedCard = service.getState().snapshot?.activeCards.find((card) => card.path === 'design/F-2-b.md')
            expect(movedCard?.agentConversationErrors).toHaveLength(1)
        })

        await service.cards.updateCardTitle('design/F-2-b.md', 'Renamed')

        const renamedCard = service.getState().snapshot?.activeCards.find(({ header }) => header.internalId === 'b')
        expect(renamedCard?.path).toBe('design/F-2-renamed.md')
        expect(renamedCard?.agentConversationErrors).toEqual([
            { kind: 'onStateAction', message: 'Ready failed with exit code 1', path: 'action-ready' },
        ])
    })

    it('does not run onState actions when a card is reordered inside the same state', async () => {
        configService.init()
        const moveFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: a\ntitle: A\nstatus: todo\n---\n\n# A', path: 'design/F-1-a.md' },
            { content: '---\nid: F-2\ninternalId: b\ntitle: B\nstatus: todo\nafter: a\n---\n\n# B', path: 'design/F-2-b.md' },
        ]
        const actionFile = {
            content: JSON.stringify({
                command: 'run',
                description: 'Todo',
                id: 'action-todo',
                label: 'Todo',
                onState: 'todo',
                type: 'command',
            }),
            path: 'actions/todo.json',
        }
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => [actionFile]),
            loadProject: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.moveCard('design/F-2-b.md', 'todo', 0)

        expect(runElectronAction).not.toHaveBeenCalled()
    })

    it('hydrates active card conversations after publishing the first snapshot and shares the popup request', async () => {
        configService.init()
        const agentFiles: MarkdownFile[] = [
            {
                content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - design/activity/card__root-card.json#conversation=agent-1\n---\n\n# Root',
                path: 'design/F-1-root.md',
            },
        ]
        const conversationLoad = createDeferred<AgentConversation[]>()
        const fullProject = createDeferred<StorageProjectFiles>()
        const storage = createStorage({
            loadActivityConversations: vi.fn(async () => conversationLoad.promise),
            loadProject: vi.fn(async () => fullProject.promise),
            loadProjectRoot: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const cardListener = vi.fn()
        const actionListener = vi.fn()
        const cardEvent = cardAcknowledgementEvent('root-card')
        const actionEvent = actionAcknowledgementEvent('root-card', 'implement')
        agentAcknowledgementService.addEventListener(cardEvent, cardListener)
        agentAcknowledgementService.addEventListener(actionEvent, actionListener)

        expect(snapshot.activeCards[0].agentConversations).toHaveLength(0)
        await vi.waitFor(() => expect(storage.loadActivityConversations).toHaveBeenCalledOnce())
        fullProject.resolve({ files: agentFiles, workingFolder: 'design' })
        const conversationRequest = service.listAgentConversations({ cardInternalId: 'root-card', file: agentFiles[0].path, kind: 'card' })
        expect(storage.loadActivityConversations).toHaveBeenCalledOnce()
        conversationLoad.resolve([{ ...conversation(), actionId: 'implement', viewed: false }])
        await conversationRequest

        await vi.waitFor(() => {
            expect(service.getState().snapshot?.activeCards[0].agentConversations[0].title).toBe('Agent run')
        })
        expect(service.getState().snapshot?.activeCards[0].agentConversations[0].viewed).toBe(false)
        expect(cardListener).toHaveBeenCalledOnce()
        expect(actionListener).toHaveBeenCalledOnce()
        agentAcknowledgementService.removeEventListener(cardEvent, cardListener)
        agentAcknowledgementService.removeEventListener(actionEvent, actionListener)
    })

    it('accepts a referenced activity file with no conversations', async () => {
        configService.init()
        const activityPath = 'design/activity/card__root-card.json'
        const cardFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - ${activityPath}\n---\n`,
            path: 'design/F-1-root.md',
        }
        const loadActivityConversations = vi.fn(async () => [])
        const storage = createStorage({
            loadActivityConversations,
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await expect(service.listAgentConversations({ cardInternalId: 'root-card', file: cardFile.path, kind: 'card' }))
            .resolves.toEqual([])

        expect(loadActivityConversations).toHaveBeenCalledOnce()
        expect(service.getState().snapshot?.activeCards[0].agentConversationErrors).toEqual([])
    })

    it('announces only the scopes of cards whose conversations were attached', async () => {
        configService.init()
        const agentFiles: MarkdownFile[] = [
            {
                content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - design/activity/card__root-card.json#conversation=agent-1\n---\n\n# Root',
                path: 'design/F-1-root.md',
            },
            {
                content: '---\nid: F-2\ninternalId: plain-card\ntitle: Plain\nstatus: active\n---\n\n# Plain',
                path: 'design/F-2-plain.md',
            },
        ]
        const storage = createStorage({
            loadActivityConversations: vi.fn(async () => [{ ...conversation(), actionId: 'implement' }]),
            loadProject: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        const loadedListener = vi.fn()
        const otherListener = vi.fn()
        const otherActionListener = vi.fn()
        const loadedEvent = cardAcknowledgementEvent('root-card')
        const otherEvent = cardAcknowledgementEvent('plain-card')
        const otherActionEvent = actionAcknowledgementEvent('root-card', 'review')
        agentAcknowledgementService.addEventListener(loadedEvent, loadedListener)
        agentAcknowledgementService.addEventListener(otherEvent, otherListener)
        agentAcknowledgementService.addEventListener(otherActionEvent, otherActionListener)

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.listAgentConversations({ cardInternalId: 'root-card', file: agentFiles[0].path, kind: 'card' })
        await vi.waitFor(() => expect(loadedListener).toHaveBeenCalledOnce())

        expect(otherListener).not.toHaveBeenCalled()
        expect(otherActionListener).not.toHaveBeenCalled()
        agentAcknowledgementService.removeEventListener(loadedEvent, loadedListener)
        agentAcknowledgementService.removeEventListener(otherEvent, otherListener)
        agentAcknowledgementService.removeEventListener(otherActionEvent, otherActionListener)
    })

    it('applies a backend conversation view change without reloading the activity file', async () => {
        configService.init()
        const agentFiles: MarkdownFile[] = [{
            content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - design/activity/card__root-card.json#conversation=agent-1\n---\n\n# Root',
            path: 'design/F-1-root.md',
        }]
        const reference = 'design/activity/card__root-card.json#conversation=agent-1'
        const loadActivityConversations = vi.fn(async () => [{ ...conversation(reference), actionId: 'implement', viewed: true }])
        const storage = createStorage({
            loadActivityConversations,
            loadProject: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
        })
        let viewedCallback: ((event: { conversationId: string; viewed: boolean }) => void) | null = null
        window.md2Actions = {
            onActionConversationViewed: (callback: (event: { conversationId: string; viewed: boolean }) => void) => {
                viewedCallback = callback

                return vi.fn()
            },
            onActionRun: () => vi.fn(),
        } as unknown as typeof window.md2Actions
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const context = { cardInternalId: 'root-card', file: agentFiles[0].path, kind: 'card' as const }
        await service.listAgentConversations(context)
        const loadsBeforeAnnouncement = loadActivityConversations.mock.calls.length
        if (!viewedCallback) throw new Error('Conversation view callback not registered')
        const announceViewed = viewedCallback as (event: { conversationId: string; viewed: boolean }) => void
        const cardListener = vi.fn()
        const actionListener = vi.fn()
        const cardEvent = cardAcknowledgementEvent('root-card')
        const actionEvent = actionAcknowledgementEvent('root-card', 'implement')
        agentAcknowledgementService.addEventListener(cardEvent, cardListener)
        agentAcknowledgementService.addEventListener(actionEvent, actionListener)

        announceViewed({ conversationId: 'agent-1', viewed: false })

        expect((await service.listAgentConversations(context))[0].viewed).toBe(false)
        expect(loadActivityConversations.mock.calls.length).toBe(loadsBeforeAnnouncement)
        expect(cardListener).toHaveBeenCalledOnce()
        expect(actionListener).toHaveBeenCalledOnce()
        agentAcknowledgementService.removeEventListener(cardEvent, cardListener)
        agentAcknowledgementService.removeEventListener(actionEvent, actionListener)
    })

    it('loads pinned card and project conversations lazily in newest-first order', async () => {
        configService.init()
        const cardActivityPath = 'design/activity/card__root-card.json'
        const projectActivityPath = 'design/activity/project.json'
        const cardConversation = { ...conversation(`${cardActivityPath}#conversation=card-pinned`), id: 'card-pinned', startedAt: '2026-01-01T00:00:00.000Z' }
        const projectConversation = {
            ...conversation(`${projectActivityPath}#conversation=project-pinned`), cardInternalId: null, cardPath: null,
            id: 'project-pinned', startedAt: '2026-01-02T00:00:00.000Z',
        }
        const agentFiles: MarkdownFile[] = [{
            content: `---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - ${cardActivityPath}\n---\n\n# Root`,
            path: 'design/F-1-root.md',
        }]
        const loadActivityConversations = vi.fn(async (_project, activityPath: string) => (
            activityPath === cardActivityPath ? [cardConversation] : [projectConversation]
        ))
        const pinnedConversations = [
            { cardInternalId: 'root-card', contextKind: 'card' as const, conversationId: 'card-pinned' },
            { contextKind: 'project' as const, conversationId: 'project-pinned' },
        ]
        const storage = createStorage({
            loadActivityConversations,
            loadProjectConfig: vi.fn(async () => ({ pinnedConversations, projectFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(service.agents.getPinnedConversationsSnapshot()).toEqual([])
        await service.agents.ensurePinnedConversationsLoaded()

        expect(loadActivityConversations).toHaveBeenCalledTimes(2)
        expect(loadActivityConversations).toHaveBeenCalledWith(expect.anything(), cardActivityPath)
        expect(loadActivityConversations).toHaveBeenCalledWith(expect.anything(), projectActivityPath)
        expect(service.agents.getPinnedConversationsSnapshot().map(({ id }) => id))
            .toEqual(['project-pinned', 'card-pinned'])
        const pinnedListener = vi.fn()
        const stopPinnedListener = service.agents.subscribePinnedConversations(pinnedListener)
        service.agents.updateAgentConversation({ ...cardConversation, title: 'Updated pinned conversation' })
        expect(pinnedListener).toHaveBeenCalledOnce()
        stopPinnedListener()

        await service.projectLoading.openProject({ branch: 'next', id: 'next-project' })
        expect(service.agents.getPinnedConversationsSnapshot()).toEqual([])
    })

    it('defers unresolved pin loading until the popup opens again', async () => {
        configService.init()
        const projectActivityPath = 'design/activity/project.json'
        const firstConversation = {
            ...conversation(`${projectActivityPath}#conversation=first`),
            cardInternalId: null,
            cardPath: null,
            id: 'first',
        }
        const secondConversation = {
            ...conversation(`${projectActivityPath}#conversation=second`),
            cardInternalId: null,
            cardPath: null,
            id: 'second',
        }
        let loadCount = 0
        const loadActivityConversations = vi.fn(async () => {
            loadCount += 1

            return loadCount === 1 ? [firstConversation] : [firstConversation, secondConversation]
        })
        const firstLocator = { contextKind: 'project' as const, conversationId: firstConversation.id }
        const secondLocator = { contextKind: 'project' as const, conversationId: secondConversation.id }
        const storage = createStorage({
            loadActivityConversations,
            loadProjectConfig: vi.fn(async () => ({ pinnedConversations: [firstLocator], projectFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.agents.setPinnedConversationsPopupOpen(true)
        await service.agents.ensurePinnedConversationsLoaded()
        service.agents.setPinnedConversationsPopupOpen(false)

        configService.loadProjectConfig({ pinnedConversations: [firstLocator, secondLocator], projectFolder: 'design' })
        await waitForWorkerTurn()
        expect(loadActivityConversations).toHaveBeenCalledOnce()

        service.agents.setPinnedConversationsPopupOpen(true)
        await service.agents.ensurePinnedConversationsLoaded()
        expect(loadActivityConversations).toHaveBeenCalledTimes(2)
        expect(service.agents.getPinnedConversationsSnapshot().map(({ id }) => id)).toEqual(['first', 'second'])
    })

    it('applies confirmed local and remote pin changes through scoped events', async () => {
        configService.init()
        const reference = 'design/activity/card__root-card.json#conversation=agent-1'
        const stored = { ...conversation(reference), cardInternalId: null, cardPath: null }
        const locator = { contextKind: 'project' as const, conversationId: stored.id }
        const storage = createStorage({loadActivityConversations: vi.fn(async () => [stored])})
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.agents.setPinnedConversationsPopupOpen(true)
        await service.agents.ensurePinnedConversationsLoaded()
        const listener = vi.fn()
        const stop = service.conversationPins.subscribeConversation(stored.id, listener)

        await service.conversationPins.setPinned(locator, true)
        await waitForWorkerTurn()

        expect(storage.saveProjectConfig).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ pinnedConversations: [locator] }),
        )
        expect(service.agents.getPinnedConversationsSnapshot()).toHaveLength(1)
        expect(listener).toHaveBeenCalledOnce()
        configService.loadProjectConfig({ pinnedConversations: [] })
        expect(service.agents.getPinnedConversationsSnapshot()).toEqual([])
        expect(listener).toHaveBeenCalledTimes(2)
        stop()
    })

    it('keeps confirmed pinned projection when loading or writing fails', async () => {
        configService.init()
        const reportError = vi.spyOn(dialogService, 'error')
        const reference = 'design/activity/project.json#conversation=agent-1'
        const stored = { ...conversation(reference), cardInternalId: null, cardPath: null }
        const locator = { contextKind: 'project' as const, conversationId: stored.id }
        const storage = createStorage({
            loadActivityConversations: vi.fn(async () => [stored]),
            loadProjectConfig: vi.fn(async () => ({ pinnedConversations: [locator], projectFolder: 'design' })),
            saveProjectConfig: vi.fn(async () => {
                throw new Error('pin disk failed')
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.agents.ensurePinnedConversationsLoaded()

        await expect(service.conversationPins.setPinned(locator, false)).rejects.toThrow('pin disk failed')
        expect(service.agents.getPinnedConversationsSnapshot()).toEqual([stored])

        const failedStorage = createStorage({
            loadActivityConversations: vi.fn(async () => {
                throw new Error('load disk failed')
            }),
            loadProjectConfig: vi.fn(async () => ({ pinnedConversations: [locator], projectFolder: 'design' })),
        })
        const failedService = createDataService()
        failedService.init({ storage: failedStorage })
        await failedService.projectLoading.openProject({ branch: 'main', id: 'failed-project' })
        await failedService.agents.ensurePinnedConversationsLoaded()
        expect(failedService.agents.getPinnedConversationsSnapshot()).toEqual([])
        expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'load disk failed' }), {fallbackMessage: 'Could not load pinned conversations'})
        reportError.mockRestore()
    })

    it('lets a backend view state overrule the one a window set optimistically', async () => {
        configService.init()
        const agentFiles: MarkdownFile[] = [{
            content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - design/activity/card__root-card.json#conversation=agent-1\n---\n\n# Root',
            path: 'design/F-1-root.md',
        }]
        const reference = 'design/activity/card__root-card.json#conversation=agent-1'
        const storage = createStorage({
            loadActivityConversations: vi.fn(async () => [{ ...conversation(reference), actionId: 'implement', viewed: false }]),
            loadProject: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
        })
        let viewedCallback: ((event: { conversationId: string; viewed: boolean }) => void) | null = null
        window.md2Actions = {
            onActionConversationViewed: (callback: (event: { conversationId: string; viewed: boolean }) => void) => {
                viewedCallback = callback

                return vi.fn()
            },
            onActionRun: () => vi.fn(),
            updateActionConversationViewed: vi.fn(async (_reference: string, viewed: boolean) => ({ viewed })),
        } as unknown as typeof window.md2Actions
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const context = { cardInternalId: 'root-card', file: agentFiles[0].path, kind: 'card' as const }
        const [stored] = await service.listAgentConversations(context)
        if (!viewedCallback) throw new Error('Conversation view callback not registered')
        const announceViewed = viewedCallback as (event: { conversationId: string; viewed: boolean }) => void

        const pending = agentAcknowledgementService.setViewed('root-card', 'implement', stored, true)
        expect(stored.viewed).toBe(true)
        await pending

        // The backend reports what it actually wrote, which differs from the optimistic value.
        announceViewed({ conversationId: 'agent-1', viewed: false })

        expect(stored.viewed).toBe(false)
        expect((await service.listAgentConversations(context))[0].viewed).toBe(false)
    })

    it('refreshes card waiting state from a backend-returned terminal conversation', async () => {
        configService.init()
        const agentFiles: MarkdownFile[] = [{
            content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - design/activity/card__root-card.json#conversation=agent-1\n---\n\n# Root',
            path: 'design/F-1-root.md',
        }]
        const waiting = { ...conversation(), completedAt: null, status: 'waitingForInput' as const }
        const storage = createStorage({
            loadActivityConversations: vi.fn(async () => [waiting]),
            loadProject: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.listAgentConversations({ cardInternalId: 'root-card', file: agentFiles[0].path, kind: 'card' })

        await vi.waitFor(() => {
            const card = service.getState().snapshot?.activeCards[0]
            expect(card && cardAgentState(card.agentConversations)).toBe('waiting for input')
        })
        service.agents.updateAgentConversation({
            ...waiting,
            completedAt: '2026-08-04T10:30:00.000Z',
            status: 'completed',
        })

        const card = service.getState().snapshot?.activeCards[0]
        expect(card && cardAgentState(card.agentConversations)).not.toBe('waiting for input')
    })

    it('hydrates card activity without loading it through the project file index', async () => {
        configService.init()
        const activityPath = 'design/activity/card__root-card.json'
        const reference = `${activityPath}#conversation=agent-1`
        const cardFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - ${reference}\n---\n\n# Root`,
            path: 'design/F-1-root.md',
        }
        const persistedConversation = {
            ...conversation(reference),
            entries: [{ content: 'new', id: 'new', kind: 'message' as const, role: 'assistant' as const, timestamp: '2026-01-01T00:02:00.000Z' }],
        }
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => ['agent_token_usage.json', cardFile.path, activityPath]),
            loadActivityConversations: vi.fn(async () => [persistedConversation]),
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        expect(storage.loadTextFile).toHaveBeenCalledOnce()
        expect(storage.loadTextFile).toHaveBeenCalledWith(expect.any(Object), 'agent_token_usage.json')
        await vi.waitFor(() => expect(storage.loadActivityConversations).toHaveBeenCalledOnce())
        await expect(service.listAgentConversations({ cardInternalId: 'root-card', file: cardFile.path, kind: 'card' }))
            .resolves.toEqual([persistedConversation])
        expect(storage.loadTextFile).toHaveBeenCalledOnce()
        expect(storage.loadActivityConversations).toHaveBeenCalledOnce()
    })

    it('refreshes an assigned worktree only after the last live conversation finishes', async () => {
        configService.init()
        const activityPath = 'design/activity/card__root-card.json'
        const firstReference = `${activityPath}#conversation=agent-1`
        const secondReference = `${activityPath}#conversation=agent-2`
        const cardFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nworktree: 1\nagents:\n  - ${firstReference}\n  - ${secondReference}\n---\n\n# Root`,
            path: 'design/F-1-root.md',
        }
        const firstRunning = { ...conversation(firstReference), completedAt: null, status: 'running' as const }
        const secondRunning = { ...conversation(secondReference), completedAt: null, id: 'agent-2', status: 'running' as const }
        const storage = createStorage({
            loadActivityConversations: vi.fn(async () => [firstRunning, secondRunning]),
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
        })
        const refreshWorktrees = vi.spyOn(worktreeService, 'refresh').mockResolvedValue(undefined)
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await expect(service.listAgentConversations({ cardInternalId: 'root-card', file: cardFile.path, kind: 'card' }))
            .resolves.toHaveLength(2)
        expect(refreshWorktrees).not.toHaveBeenCalled()

        service.agents.updateAgentConversation({ ...firstRunning, completedAt: '2026-01-01T00:02:00.000Z', status: 'completed' })
        expect(refreshWorktrees).not.toHaveBeenCalled()

        service.agents.updateAgentConversation({ ...secondRunning, completedAt: '2026-01-01T00:03:00.000Z', status: 'completed' })
        expect(refreshWorktrees).toHaveBeenCalledOnce()
    })

    it('does not refresh worktrees when the last live conversation finishes on primary', async () => {
        configService.init()
        const reference = 'design/activity/card__root-card.json#conversation=agent-1'
        const cardFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - ${reference}\n---\n\n# Root`,
            path: 'design/F-1-root.md',
        }
        const running = { ...conversation(reference), completedAt: null, status: 'running' as const }
        const storage = createStorage({
            loadActivityConversations: vi.fn(async () => [running]),
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
        })
        const refreshWorktrees = vi.spyOn(worktreeService, 'refresh').mockResolvedValue(undefined)
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.listAgentConversations({ cardInternalId: 'root-card', file: cardFile.path, kind: 'card' })
        expect(service.getState().snapshot?.activeCards[0].header.worktree).toBeNull()
        refreshWorktrees.mockClear()
        service.agents.updateAgentConversation({ ...running, completedAt: '2026-01-01T00:02:00.000Z', status: 'completed' })

        expect(refreshWorktrees).not.toHaveBeenCalled()
    })

    it('keeps newer inserted conversation when delayed project load returns same ID', async () => {
        configService.init()
        const reference = 'design/activity/card__root-card.json#conversation=agent-1'
        const cardFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - ${reference}\n---\n\n# Root`,
            path: 'design/F-1-root.md',
        }
        const delayedConversationLoad = createDeferred<AgentConversation[]>()
        const storage = createStorage({
            loadActivityConversations: vi.fn(async () => delayedConversationLoad.promise),
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const conversationRequest = service.listAgentConversations({ cardInternalId: 'root-card', file: cardFile.path, kind: 'card' })
        await vi.waitFor(() => expect(storage.loadActivityConversations).toHaveBeenCalledTimes(1))
        const newerConversation = {
            ...conversation(reference),
            entries: [{ content: 'new', id: 'new', kind: 'message' as const, role: 'assistant' as const, timestamp: '2026-01-01T00:02:00.000Z' }],
        }
        service.agents.updateAgentConversation(newerConversation)

        delayedConversationLoad.resolve([{
            ...conversation(reference),
            completedAt: null,
            entries: [{ content: 'old', id: 'old', kind: 'message', role: 'assistant', timestamp: '2026-01-01T00:01:00.000Z' }],
            status: 'running',
        }])
        await conversationRequest

        await waitForWorkerTurn()
        await waitForWorkerTurn()
        expect(service.getState().snapshot?.activeCards[0].agentConversations).toEqual([newerConversation])
    })

    it('preloads only active card conversations and reuses their cache', async () => {
        configService.init()
        const activeFile: MarkdownFile = {
            content: '---\nid: F-1\ninternalId: active-card\ntitle: Active\nstatus: active\nagents:\n  - design/activity/card__active-card.json#conversation=active\n---\n\n# Active',
            path: 'design/active/F-1-active.md',
        }
        const archivedFile: MarkdownFile = {
            content: '---\nid: F-2\ninternalId: archived-card\ntitle: Archived\nstatus: archived\nagents:\n  - design/activity/card__archived-card.json#conversation=archived\n---\n\n# Archived',
            path: 'design/archived/F-2-archived.md',
        }
        const releasedFile: MarkdownFile = {
            content: '---\nid: F-3\ninternalId: released-card\ntitle: Released\nstatus: ready\nagents:\n  - design/history/v1/card__released-card.json#conversation=released\n---\n\n# Released',
            path: 'design/history/v1/F-3-released.md',
        }
        const actionDocument: MarkdownFile = {
            content: '---\nid: A-1\ninternalId: action-document\ntitle: Action prompt\nagents:\n  - design/activity/card__action-document.json#conversation=action\n---\n\n# Action prompt',
            path: 'design/actions/prompt.md',
        }
        const allFiles = [activeFile, archivedFile, releasedFile, actionDocument]
        const loadActivityConversations = vi.fn(async (_project, path: string) => {
            const reference = `${path}#conversation=loaded`
            if (path.includes('active-card')) {
                return [{
                    ...conversation(reference),
                    cardInternalId: 'active-card',
                    cardPath: activeFile.path,
                    id: 'active',
                }]
            }
            if (path.includes('archived-card')) {
                return [{
                    ...conversation(reference),
                    cardInternalId: 'archived-card',
                    cardPath: archivedFile.path,
                    id: 'archived',
                }]
            }

            return [{
                ...conversation(reference),
                cardInternalId: 'released-card',
                cardPath: releasedFile.path,
                id: 'released',
            }]
        })
        const storage = createStorage({
            loadActivityConversations,
            loadProject: vi.fn(async () => ({ files: allFiles, workingFolder: 'design/active' })),
            loadProjectConfig: vi.fn(async () => ({
                actionsFolder: 'actions',
                archivedFolder: 'archived',
                backgroundShade: 'blue' as const,
                projectFolder: 'design',
                releasesFolder: 'history',
                workingFolder: 'active',
            })),
            loadProjectRoot: vi.fn(async () => ({ files: [activeFile], workingFolder: 'design/active' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await vi.waitFor(() => expect(loadActivityConversations).toHaveBeenCalledOnce())
        await vi.waitFor(() => expect(service.getState().snapshot?.backgroundCards).toHaveLength(3))
        await service.listAgentConversations({ cardInternalId: 'active-card', file: activeFile.path, kind: 'card' })
        expect(loadActivityConversations).toHaveBeenCalledOnce()
        expect(service.getState().snapshot?.activeCards[0].agentConversations).toHaveLength(1)
        const loadedPaths = loadActivityConversations.mock.calls.map(([, path]) => path)
        expect(loadedPaths).toEqual(['design/activity/card__active-card.json'])
        expect(loadedPaths).not.toContain('design/activity/card__action-document.json')
        expect(service.getState().snapshot?.backgroundCards.every(({ agentConversations }) => agentConversations.length === 0)).toBe(true)
    })

    it('loads project conversations on request and shares an in-flight popup request', async () => {
        configService.init()
        const projectConversationLoad = createDeferred<AgentConversation>()
        const projectReference = 'design/activity/project.json#conversation=project-agent'
        const loadAgentConversation = vi.fn(async () => projectConversationLoad.promise)
        const listAgentConversationReferences = vi.fn(async () => [projectReference])
        const storage = createStorage({ loadAgentConversation, listAgentConversationReferences })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        expect(listAgentConversationReferences).not.toHaveBeenCalled()
        expect(loadAgentConversation).not.toHaveBeenCalled()
        const context = { kind: 'project' as const }
        const firstRequest = service.listAgentConversations(context)
        const secondRequest = service.listAgentConversations(context)
        await vi.waitFor(() => expect(loadAgentConversation).toHaveBeenCalledTimes(1))

        const projectConversation = { ...conversation(projectReference), cardInternalId: null, cardPath: null }
        projectConversationLoad.resolve(projectConversation)

        await expect(firstRequest).resolves.toEqual([projectConversation])
        await expect(secondRequest).resolves.toEqual([projectConversation])
        await expect(service.listAgentConversations(context)).resolves.toEqual([projectConversation])
        expect(service.agents.getProjectAgentConversationsSnapshot()).toBe(await service.listAgentConversations(context))
        expect(listAgentConversationReferences).toHaveBeenCalledTimes(1)
        expect(loadAgentConversation).toHaveBeenCalledTimes(1)
    })

    it('applies live project conversation snapshots and announces each change', async () => {
        configService.init()
        let actionRunCallback: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: (callback: (event: ActionRunEvent) => void) => {
                actionRunCallback = callback

                return vi.fn()
            },
            updateActionConversationViewed: vi.fn(async (_reference: string, viewed: boolean) => ({ viewed })),
        } as unknown as typeof window.md2Actions
        const service = createDataService()
        service.init({ storage: createStorage() })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        if (!actionRunCallback) throw new Error('Action run callback not registered')
        const emitActionRun = actionRunCallback as (event: ActionRunEvent) => void
        const changed = vi.fn()
        agentAcknowledgementService.addEventListener(PROJECT_ACKNOWLEDGEMENT_EVENT, changed)
        const context = { kind: 'project' as const }
        const reference = 'design/activity/project.json#conversation=project-agent'
        const runningConversation = {...conversation(reference), cardInternalId: null, cardPath: null, status: 'running' as const}
        const startedEvent = {
            actionId: 'implement', context, runId: 'project-run', phase: 'main' as const,
            rootActionId: 'implement', status: 'running' as const, type: 'update' as const,
            update: { conversation: runningConversation, kind: 'agentStarted' as const },
        }

        emitActionRun(startedEvent)
        expect(service.agents.getProjectAgentConversationsSnapshot()).toEqual([runningConversation])

        const completedConversation = { ...runningConversation, status: 'completed' as const, viewed: false }
        emitActionRun({
            ...startedEvent,
            status: 'completed',
            update: { conversation: completedConversation, kind: 'agentClosed', persisted: true },
        })

        expect(service.agents.getProjectAgentConversationsSnapshot()).toEqual([completedConversation])
        expect(changed.mock.calls.length).toBeGreaterThanOrEqual(2)
        agentAcknowledgementService.removeEventListener(PROJECT_ACKNOWLEDGEMENT_EVENT, changed)
    })

    it('loads one historical card on demand and shares completed and concurrent requests', async () => {
        configService.init()
        const historicalReference = 'design/activity/card__historical-card.json#conversation=historical'
        const activeFile: MarkdownFile = {
            content: '---\nid: F-1\ninternalId: active-card\ntitle: Active\nstatus: active\n---\n\n# Active',
            path: 'design/F-1-active.md',
        }
        const historicalFile: MarkdownFile = {
            content: `---\nid: F-2\ninternalId: historical-card\ntitle: Historical\nstatus: released\nagents:\n  - ${historicalReference}\n---\n\n# Historical`,
            path: 'design/history/F-2-historical.md',
        }
        const emptyHistoricalFile: MarkdownFile = {
            content: '---\nid: F-3\ninternalId: empty-card\ntitle: Empty\nstatus: released\n---\n\n# Empty',
            path: 'design/history/F-3-empty.md',
        }
        const historicalConversationLoad = createDeferred<AgentConversation[]>()
        const loadActivityConversations = vi.fn(async () => historicalConversationLoad.promise)
        const storage = createStorage({
            loadActivityConversations,
            loadProject: vi.fn(async () => ({ files: [activeFile, historicalFile, emptyHistoricalFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [activeFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await vi.waitFor(() => expect(service.getState().snapshot?.backgroundCards).toHaveLength(2))
        expect(loadActivityConversations).not.toHaveBeenCalled()

        const emptyContext = { cardInternalId: 'empty-card', file: emptyHistoricalFile.path, kind: 'card' as const }
        await expect(service.listAgentConversations(emptyContext)).resolves.toEqual([])
        expect(loadActivityConversations).not.toHaveBeenCalled()

        const context = { cardInternalId: 'historical-card', file: historicalFile.path, kind: 'card' as const }
        const firstRequest = service.listAgentConversations(context)
        const secondRequest = service.listAgentConversations(context)
        await vi.waitFor(() => expect(loadActivityConversations).toHaveBeenCalledTimes(1))
        const loadedConversation = {
            ...conversation(historicalReference),
            cardInternalId: 'historical-card',
            cardPath: historicalFile.path,
            id: 'historical',
        }
        historicalConversationLoad.resolve([loadedConversation])

        await expect(firstRequest).resolves.toEqual([loadedConversation])
        await expect(secondRequest).resolves.toEqual([loadedConversation])
        await expect(service.listAgentConversations(context)).resolves.toEqual([loadedConversation])
        expect(loadActivityConversations).toHaveBeenCalledTimes(1)
        const snapshot = service.getState().snapshot
        expect(snapshot?.backgroundCards.find(({ path }) => path === historicalFile.path)?.agentConversations).toEqual([loadedConversation])
        expect(snapshot?.backgroundCards.find(({ path }) => path === emptyHistoricalFile.path)?.agentConversations).toEqual([])
    })

    it('attaches a manually referenced activity despite stored card identity mismatch', async () => {
        configService.init()
        const invalidReference = 'design/activity/card__historical-card.json#conversation=wrong-card'
        const activeFile: MarkdownFile = {
            content: '---\nid: F-1\ninternalId: active-card\ntitle: Active\nstatus: active\n---\n\n# Active',
            path: 'design/F-1-active.md',
        }
        const historicalFile: MarkdownFile = {
            content: `---\nid: F-2\ninternalId: historical-card\ntitle: Historical\nstatus: released\nagents:\n  - ${invalidReference}\n---\n\n# Historical`,
            path: 'design/history/F-2-historical.md',
        }
        const otherFile: MarkdownFile = {
            content: '---\nid: F-3\ninternalId: other-card\ntitle: Other\nstatus: released\n---\n\n# Other',
            path: 'design/history/F-3-other.md',
        }
        const loadedConversation = { ...conversation(invalidReference), cardInternalId: 'other-card' }
        const storage = createStorage({
            loadActivityConversations: vi.fn(async () => [loadedConversation]),
            loadProject: vi.fn(async () => ({ files: [activeFile, historicalFile, otherFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [activeFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await vi.waitFor(() => expect(service.getState().snapshot?.backgroundCards).toHaveLength(2))

        const context = { cardInternalId: 'historical-card', file: historicalFile.path, kind: 'card' as const }
        await expect(service.listAgentConversations(context)).resolves.toEqual([
            expect.objectContaining({ cardInternalId: 'other-card' }),
        ])
        const updatedConversation = { ...loadedConversation, title: 'Updated', viewed: false }
        service.agents.updateAgentConversation(updatedConversation)

        const snapshot = service.getState().snapshot
        expect(snapshot?.backgroundCards.find(({ path }) => path === historicalFile.path)?.agentConversationErrors).toEqual([])
        expect(snapshot?.backgroundCards.find(({ path }) => path === historicalFile.path)?.agentConversations)
            .toEqual([updatedConversation])
        expect(snapshot?.backgroundCards.find(({ path }) => path === otherFile.path)?.agentConversationErrors).toEqual([])
        expect(service.agents.findStoredConversation(updatedConversation)).toBe(updatedConversation)
    })

    it('ignores active-card hydration that finishes after project switching', async () => {
        configService.init()
        const oldReference = 'design/activity/card__old-card.json#conversation=old'
        const oldActiveFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: old-card\ntitle: Old active\nstatus: active\nagents:\n  - ${oldReference}\n---\n\n# Old active`,
            path: 'design/F-1-old-active.md',
        }
        const newActiveFile: MarkdownFile = {
            content: '---\nid: F-3\ninternalId: new-active\ntitle: New active\nstatus: active\n---\n\n# New active',
            path: 'design/F-3-new-active.md',
        }
        const oldConversationLoad = createDeferred<AgentConversation[]>()
        const loadProjectRoot = vi.fn(async (project: { id: string }) => ({
            files: project.id === 'old-project' ? [oldActiveFile] : [newActiveFile],
            workingFolder: 'design',
        }))
        const loadProject = vi.fn(async (project: { id: string }) => ({
            files: project.id === 'old-project' ? [oldActiveFile] : [newActiveFile],
            workingFolder: 'design',
        }))
        const storage = createStorage({
            loadActivityConversations: vi.fn(async () => oldConversationLoad.promise),
            loadProject,
            loadProjectRoot,
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'old-project' })
        await vi.waitFor(() => expect(storage.loadActivityConversations).toHaveBeenCalledTimes(1))

        await service.projectLoading.openProject({ branch: 'main', id: 'new-project' })
        oldConversationLoad.resolve([{
            ...conversation(oldReference),
            cardInternalId: 'old-card',
            cardPath: oldActiveFile.path,
        }])
        await waitForWorkerTurn()
        await waitForWorkerTurn()

        expect(service.getState().snapshot?.activeCards[0].header.internalId).toBe('new-active')
        expect(service.agents.getAgentConversations('old-card')).toEqual([])
    })

    it('keeps conversations available while their card file is temporarily absent', async () => {
        vi.useFakeTimers()
        configService.init()
        const cardFile: MarkdownFile = {
            content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - design/activity/card__root-card.json#conversation=agent-1\n---\n\n# Root',
            path: 'design/F-1-root.md',
        }
        let watchChange: (event: { changeKind: 'changed' | 'removed'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => cardFile),
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const context = { cardInternalId: 'root-card', file: cardFile.path, kind: 'card' as const }
        await service.listAgentConversations(context)
        await vi.waitFor(() => {
            expect(service.getState().snapshot?.activeCards[0].agentConversations).toHaveLength(1)
        })

        watchChange({ changeKind: 'removed', path: cardFile.path })
        await vi.advanceTimersByTimeAsync(800)

        await expect(service.listAgentConversations(context)).resolves.toHaveLength(1)

        watchChange({ changeKind: 'changed', path: cardFile.path })
        await vi.advanceTimersByTimeAsync(50)

        expect(service.getState().snapshot?.activeCards[0].agentConversations).toHaveLength(1)
    })

    it('loads one referenced activity file once and attaches every conversation in stored order', async () => {
        configService.init()
        let activeLoads = 0
        let maxActiveLoads = 0
        const agentReferences = Array.from({ length: 10 }, (_item, index) => `design/activity/card__root-card.json#conversation=agent-${index}`)
        const agentFile: MarkdownFile = {
            content: [
                '---',
                'id: F-1',
                'internalId: root-card',
                'title: Root',
                'status: active',
                'agents:',
                ...agentReferences.map((reference) => `  - ${reference}`),
                '---',
                '',
                '# Root',
            ].join('\n'),
            path: 'design/F-1-root.md',
        }
        const fullProject = createDeferred<StorageProjectFiles>()
        const loadActivityConversations = vi.fn(async () => {
            activeLoads += 1
            maxActiveLoads = Math.max(maxActiveLoads, activeLoads)
            await waitForWorkerTurn()
            activeLoads -= 1

            return agentReferences.map((reference, index) => ({ ...conversation(reference), id: `agent-${index}` }))
        })
        const storage = createStorage({
            loadActivityConversations,
            loadProject: vi.fn(async () => fullProject.promise),
            loadProjectRoot: vi.fn(async () => ({ files: [agentFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        fullProject.resolve({ files: [agentFile], workingFolder: 'design' })
        await service.listAgentConversations({ cardInternalId: 'root-card', file: agentFile.path, kind: 'card' })

        await vi.waitFor(() => {
            expect(service.getState().snapshot?.activeCards[0].agentConversations).toHaveLength(10)
        })
        expect(loadActivityConversations).toHaveBeenCalledTimes(1)
        expect(service.getState().snapshot?.activeCards[0].agentConversations.map(({ id }) => id))
            .toEqual(agentReferences.map((_reference, index) => `agent-${index}`))
        expect(maxActiveLoads).toBe(1)
    })

    it('keeps active cards usable when background conversation hydration fails', async () => {
        configService.init()
        const agentFiles: MarkdownFile[] = [
            {
                content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - design/activity/card__root-card.json#conversation=missing\n---\n\n# Root',
                path: 'design/F-1-root.md',
            },
        ]
        const fullProject = createDeferred<StorageProjectFiles>()
        const storage = createStorage({
            loadActivityConversations: vi.fn(async () => {
                throw new Error('Agent log not found')
            }),
            loadProject: vi.fn(async () => fullProject.promise),
            loadProjectRoot: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(snapshot.activeCards[0].header.title).toBe('Root')
        expect(snapshot.activeCards[0].agentConversationErrors).toEqual([])
        fullProject.resolve({ files: agentFiles, workingFolder: 'design' })

        await vi.waitFor(() => {
            expect(service.getState().snapshot?.activeCards[0].agentConversationErrors).toEqual([
                { message: 'Agent log not found', path: 'design/activity/card__root-card.json' },
            ])
        })
    })

    it('tracks desktop-owned scheduled runs only in the shared run registry', async () => {
        configService.init()
        let scheduledRunCallback: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: (callback: (event: ActionRunEvent) => void) => {
                scheduledRunCallback = callback

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        if (!scheduledRunCallback) throw new Error('Scheduled run callback not registered')
        const emitScheduledRun = scheduledRunCallback as (event: ActionRunEvent) => void

        const context = { cardInternalId: 'root-card', file: 'design/F-1-root.md', kind: 'card' as const }
        emitScheduledRun({ actionId: 'implement', context, runId: 'schedule-1', phase: 'main', rootActionId: 'implement', status: 'running', type: 'run' })
        expect(actionRunRegistry.getGlobalActiveSnapshot()).toEqual([expect.objectContaining({ runId: 'schedule-1' })])
        expect(service.getState().runningAgents).toEqual([])

        emitScheduledRun({ actionId: 'implement', context, runId: 'schedule-1', phase: 'main', rootActionId: 'implement', status: 'completed', type: 'run' })

        expect(actionRunRegistry.getGlobalActiveSnapshot()).toHaveLength(0)
    })

    it('lets two renderer subscribers apply start and close snapshots without scheduling card writes', async () => {
        configService.init()
        let actionRunCallback: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: (callback: (event: ActionRunEvent) => void) => {
                actionRunCallback = callback

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        const desktopStorage = createStorage()
        const remoteStorage = createStorage()
        const desktopService = createDataService()
        desktopService.init({ storage: desktopStorage })
        await desktopService.projectLoading.openProject({ branch: 'main', id: 'project' })
        const remoteService = createDataService()
        remoteService.init({ storage: remoteStorage })
        await remoteService.projectLoading.openProject({ branch: 'main', id: 'project' })
        const desktopAddReference = vi.spyOn(desktopService.cards, 'addAgentLogReference')
        const remoteAddReference = vi.spyOn(remoteService.cards, 'addAgentLogReference')
        if (!actionRunCallback) throw new Error('Action run callback not registered')
        const emitActionRun = actionRunCallback as (event: ActionRunEvent) => void

        const context = { cardInternalId: 'root-card', file: 'design/F-1-root.md', kind: 'card' as const }
        const reference = 'design/activity/card__root-card.json#conversation=agent-1'
        const runningConversation = { ...conversation(reference), completedAt: null, status: 'running' as const }
        const startedEvent = {
            actionId: 'implement', context, runId: 'action-1', phase: 'main' as const,
            rootActionId: 'implement', status: 'running' as const, type: 'update' as const,
            update: { conversation: runningConversation, kind: 'agentStarted' as const },
        }
        emitActionRun(startedEvent)
        emitActionRun({ ...startedEvent, update: { ...startedEvent.update, continued: true } })

        expect(desktopService.getState().snapshot?.activeCards[0].agentConversations).toEqual([runningConversation])
        expect(remoteService.getState().snapshot?.activeCards[0].agentConversations).toEqual([runningConversation])

        const completedConversation = {
            ...runningConversation,
            completedAt: '2026-01-01T00:01:00.000Z',
            status: 'completed' as const,
        }
        emitActionRun({
            actionId: 'implement', context, runId: 'action-1', phase: 'main', rootActionId: 'implement',
            status: 'completed', type: 'update', update: { conversation: completedConversation, kind: 'agentClosed', persisted: true },
        })

        expect(desktopService.getState().snapshot?.activeCards[0].agentConversations).toEqual([completedConversation])
        expect(remoteService.getState().snapshot?.activeCards[0].agentConversations).toEqual([completedConversation])
        expect(desktopAddReference).not.toHaveBeenCalled()
        expect(remoteAddReference).not.toHaveBeenCalled()
        expect(desktopStorage.commit).not.toHaveBeenCalled()
        expect(remoteStorage.commit).not.toHaveBeenCalled()
    })

    it('applies a closed conversation snapshot when the started event was missed', async () => {
        configService.init()
        let actionRunCallback: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: (callback: (event: ActionRunEvent) => void) => {
                actionRunCallback = callback

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        if (!actionRunCallback) throw new Error('Action run callback not registered')
        const emitActionRun = actionRunCallback as (event: ActionRunEvent) => void

        const context = { cardInternalId: 'root-card', file: 'design/F-1-root.md', kind: 'card' as const }
        const reference = 'design/activity/card__root-card.json#conversation=agent-1'
        const completedConversation = { ...conversation(reference), status: 'completed' as const }
        emitActionRun({
            actionId: 'implement', context, runId: 'action-1', phase: 'main', rootActionId: 'implement',
            status: 'completed', type: 'update', update: { conversation: completedConversation, kind: 'agentClosed', persisted: true },
        })

        expect(storage.loadAgentConversation).not.toHaveBeenCalled()
        expect(service.getState().snapshot?.activeCards[0].agentConversations).toEqual([completedConversation])
        expect(service.getState().snapshot?.activeCards[0].header.agentLogReferences).toEqual([])
    })

    it('turns the card spinner into the waiting state on a backend agent state event without an agentClosed', async () => {
        configService.init()
        let actionRunCallback: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: (callback: (event: ActionRunEvent) => void) => {
                actionRunCallback = callback

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        const service = createDataService()
        service.init({ storage: createStorage() })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        if (!actionRunCallback) throw new Error('Action run callback not registered')
        const emitActionRun = actionRunCallback as (event: ActionRunEvent) => void

        const context = { cardInternalId: 'root-card', file: 'design/F-1-root.md', kind: 'card' as const }
        const reference = 'design/activity/card__root-card.json#conversation=agent-1'
        const runningConversation = { ...conversation(reference), actionId: 'implement', completedAt: null, status: 'running' as const }
        const runEvent = {
            actionId: 'implement', context, runId: 'action-1', phase: 'main' as const,
            rootActionId: 'implement', status: 'running' as const,
        }
        emitActionRun({ ...runEvent, type: 'update', update: { conversation: runningConversation, kind: 'agentStarted' } })
        const cardBefore = service.getState().snapshot?.activeCards[0]
        const conversationsBefore = cardBefore?.agentConversations
        const actionChanged = vi.fn()
        const cardChanged = vi.fn()
        agentAcknowledgementService.addEventListener(actionAcknowledgementEvent('root-card', 'implement'), actionChanged)
        agentAcknowledgementService.addEventListener(cardAcknowledgementEvent('root-card'), cardChanged)

        emitActionRun({ ...runEvent, status: 'waitingForInput', type: 'agentState' })

        const cardAfter = service.getState().snapshot?.activeCards[0]
        expect(cardAgentState(cardAfter?.agentConversations ?? [])).toBe('waiting for input')
        expect(actionChanged).toHaveBeenCalledTimes(1)
        expect(cardChanged).toHaveBeenCalledTimes(1)
        expect(cardAfter).toBe(cardBefore)
        expect(cardAfter?.agentConversations).toBe(conversationsBefore)
        agentAcknowledgementService.removeEventListener(actionAcknowledgementEvent('root-card', 'implement'), actionChanged)
        agentAcknowledgementService.removeEventListener(cardAcknowledgementEvent('root-card'), cardChanged)
    })

    it('clears the card spinner when the run fails without an agentClosed', async () => {
        configService.init()
        let actionRunCallback: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: (callback: (event: ActionRunEvent) => void) => {
                actionRunCallback = callback

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        const service = createDataService()
        service.init({ storage: createStorage() })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        if (!actionRunCallback) throw new Error('Action run callback not registered')
        const emitActionRun = actionRunCallback as (event: ActionRunEvent) => void

        const context = { cardInternalId: 'root-card', file: 'design/F-1-root.md', kind: 'card' as const }
        const reference = 'design/activity/card__root-card.json#conversation=agent-1'
        const runningConversation = { ...conversation(reference), actionId: 'implement', completedAt: null, status: 'running' as const }
        const runEvent = {
            actionId: 'implement', context, runId: 'action-1', phase: 'main' as const,
            rootActionId: 'implement', status: 'running' as const,
        }
        emitActionRun({ ...runEvent, type: 'update', update: { conversation: runningConversation, kind: 'agentStarted' } })
        expect(cardAgentState(service.getState().snapshot?.activeCards[0].agentConversations ?? [])).toBe('running')

        emitActionRun({ ...runEvent, status: 'failed', type: 'run' })

        const conversations = service.getState().snapshot?.activeCards[0].agentConversations ?? []
        expect(conversations[0].status).toBe('failed')
        expect(cardAgentState(conversations)).toBe('idle')
    })

    it('adopts the corrected activity record on a later load when no live run holds the conversation', async () => {
        configService.init()
        let actionRunCallback: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: (callback: (event: ActionRunEvent) => void) => {
                actionRunCallback = callback

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        const reference = 'design/activity/project.json#conversation=project-agent'
        const corrected = { ...conversation(reference), cardInternalId: null, cardPath: null, id: 'project-agent', status: 'failed' as const }
        const storage = createStorage({
            listAgentConversationReferences: vi.fn(async () => [reference]),
            loadAgentConversation: vi.fn(async () => corrected),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        if (!actionRunCallback) throw new Error('Action run callback not registered')
        const emitActionRun = actionRunCallback as (event: ActionRunEvent) => void

        const context = { kind: 'project' as const }
        const runEvent = {
            actionId: 'implement', context, runId: 'project-run', phase: 'main' as const,
            rootActionId: 'implement', status: 'running' as const,
        }
        const running = { ...corrected, completedAt: null, status: 'running' as const }
        emitActionRun({ ...runEvent, type: 'update', update: { conversation: running, kind: 'agentStarted' } })
        emitActionRun({ ...runEvent, status: 'cancelled', type: 'run' })
        expect(actionRunRegistry.hasLiveConversation('project-agent')).toBe(false)

        await expect(service.listAgentConversations(context)).resolves.toEqual([corrected])
    })

    it('keeps the live record when a load returns while the run still holds the conversation', async () => {
        configService.init()
        let actionRunCallback: ((event: ActionRunEvent) => void) | null = null
        window.md2Actions = {
            onActionRun: (callback: (event: ActionRunEvent) => void) => {
                actionRunCallback = callback

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        const reference = 'design/activity/project.json#conversation=project-agent'
        const persisted = { ...conversation(reference), cardInternalId: null, cardPath: null, id: 'project-agent', status: 'completed' as const }
        const storage = createStorage({
            listAgentConversationReferences: vi.fn(async () => [reference]),
            loadAgentConversation: vi.fn(async () => persisted),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        if (!actionRunCallback) throw new Error('Action run callback not registered')
        const emitActionRun = actionRunCallback as (event: ActionRunEvent) => void

        const context = { kind: 'project' as const }
        const running = { ...persisted, completedAt: null, status: 'running' as const }
        emitActionRun({
            actionId: 'implement', context, runId: 'project-run', phase: 'main', rootActionId: 'implement',
            status: 'running', type: 'update', update: { conversation: running, kind: 'agentStarted' },
        })
        expect(actionRunRegistry.hasLiveConversation('project-agent')).toBe(true)

        await expect(service.listAgentConversations(context)).resolves.toEqual([running])
    })
})

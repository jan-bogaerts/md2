import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, MarkdownFile, StorageProjectFiles } from '../../data/data_types'
import type { ActionRunEvent } from '../../data/action_run_types'
import { runElectronAction } from '../actions/electron_action_runner'
import { actionRunRegistry } from '../actions/action_run_registry'
import { configService } from '../config/config_service'
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
            update: { conversation: completedConversation, kind: 'agentClosed' },
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

    it('applies started and closed conversation snapshots without reading the activity file', async () => {
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
        service.cards.updateCardWorktree('design/F-1-root.md', 3)
        service.cards.toggleCardPolicy('design/F-1-root.md', 'allowNetwork')
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

        expect(service.getState().snapshot?.activeCards[0].header.agentLogReferences).toEqual(['design/activity/card__root-card.json'])
        expect(service.getState().snapshot?.activeCards[0].agentConversations).toEqual([runningConversation])
        expect(storage.loadAgentConversation).not.toHaveBeenCalled()

        const completedConversation = {
            ...runningConversation,
            completedAt: '2026-01-01T00:01:00.000Z',
            status: 'completed' as const,
        }
        emitActionRun({
            actionId: 'implement', context, runId: 'action-1', phase: 'main', rootActionId: 'implement',
            status: 'completed', type: 'update', update: { conversation: completedConversation, kind: 'agentClosed' },
        })

        expect(service.getState().snapshot?.activeCards[0].agentConversations).toEqual([completedConversation])
        expect(storage.loadAgentConversation).not.toHaveBeenCalled()
        expect(service.getState().snapshot?.activeCards[0].header.agentLogReferences).toEqual(['design/activity/card__root-card.json'])
        expect(service.getState().snapshot?.activeCards[0].header.worktree).toBe(3)
        expect(service.getState().snapshot?.activeCards[0].header.policy).toEqual({ allowNetwork: true })
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
            status: 'completed', type: 'update', update: { conversation: completedConversation, kind: 'agentClosed' },
        })

        expect(storage.loadAgentConversation).not.toHaveBeenCalled()
        expect(service.getState().snapshot?.activeCards[0].agentConversations).toEqual([completedConversation])
        expect(service.getState().snapshot?.activeCards[0].header.agentLogReferences).toEqual(['design/activity/card__root-card.json'])
    })
})

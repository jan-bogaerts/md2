import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, MarkdownFile, StorageProjectFiles } from '../../data/data_types'
import type { ActionExecutionEvent } from '../../data/action_run_types'
import { runElectronAction } from '../actions/electron_action_runner'
import { actionExecutionService } from '../actions/action_execution_service'
import { configService } from '../config/config_service'
import { conversation, createDataService, createDeferred, createStorage, waitForWorkerTurn } from '.././test_support/data_service_test_support'

vi.mock('../actions/electron_action_runner', () => ({ runElectronAction: vi.fn(async () => ({ logs: [], status: 'completed' })) }))

describe('AgentIntegration', () => {
    afterEach(() => {
        actionExecutionService.stop()
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
                { message: 'Ready failed with exit code 1', path: 'onState:action-ready' },
            ])
        })
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

    it('loads referenced agent conversations onto cards', async () => {
        configService.init()
        const agentFiles: MarkdownFile[] = [
            {
                content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - design/activity/card__root-card.json#conversation=agent-1\n---\n\n# Root',
                path: 'design/F-1-root.md',
            },
        ]
        const conversationLoad = createDeferred<AgentConversation>()
        const fullProject = createDeferred<StorageProjectFiles>()
        const storage = createStorage({
            loadAgentConversation: vi.fn(async () => conversationLoad.promise),
            loadProject: vi.fn(async () => fullProject.promise),
            loadProjectRoot: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(snapshot.activeCards[0].agentConversations).toHaveLength(0)
        conversationLoad.resolve(conversation())

        await vi.waitFor(() => {
            expect(service.getState().snapshot?.activeCards[0].agentConversations[0].title).toBe('Agent run')
        })
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
        await vi.waitFor(() => {
            expect(service.getState().snapshot?.activeCards[0].agentConversations).toHaveLength(1)
        })

        watchChange({ changeKind: 'removed', path: cardFile.path })
        await vi.advanceTimersByTimeAsync(800)

        const context = { cardInternalId: 'root-card', file: cardFile.path, kind: 'card' as const }
        await expect(service.listAgentConversations(context)).resolves.toHaveLength(1)

        watchChange({ changeKind: 'changed', path: cardFile.path })
        await vi.advanceTimersByTimeAsync(50)

        expect(service.getState().snapshot?.activeCards[0].agentConversations).toHaveLength(1)
    })

    it('bounds parallel referenced agent conversation loads', async () => {
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
        const storage = createStorage({
            loadAgentConversation: vi.fn(async (_project, path) => {
                activeLoads += 1
                maxActiveLoads = Math.max(maxActiveLoads, activeLoads)
                await waitForWorkerTurn()
                activeLoads -= 1

                return { ...conversation(path), id: path }
            }),
            loadProject: vi.fn(async () => fullProject.promise),
            loadProjectRoot: vi.fn(async () => ({ files: [agentFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await vi.waitFor(() => {
            expect(service.getState().snapshot?.activeCards[0].agentConversations).toHaveLength(10)
        })
        expect(maxActiveLoads).toBeGreaterThan(1)
        expect(maxActiveLoads).toBeLessThanOrEqual(8)
    })

    it('keeps cards loaded when a referenced agent log is invalid', async () => {
        configService.init()
        const agentFiles: MarkdownFile[] = [
            {
                content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - design/activity/card__root-card.json#conversation=missing\n---\n\n# Root',
                path: 'design/F-1-root.md',
            },
        ]
        const fullProject = createDeferred<StorageProjectFiles>()
        const storage = createStorage({
            loadAgentConversation: vi.fn(async () => {
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

        await vi.waitFor(() => {
            expect(service.getState().snapshot?.activeCards[0].agentConversationErrors).toEqual([
                { message: 'Agent log not found', path: 'design/activity/card__root-card.json#conversation=missing' },
            ])
        })
    })

    it('continues a conversation through its originating Electron action', async () => {
        configService.init()
        const sourceConversation = { ...conversation(), actionId: 'md2.custom-prompt' }
        const cardFile = {
            content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\nagents:\n  - design/activity/card__root-card.json#conversation=agent-1\n---\n\n# Root',
            path: 'design/F-1-root.md',
        }
        const storage = createStorage({
            loadAgentConversation: vi.fn(async () => sourceConversation),
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await vi.waitFor(() => expect(service.getState().snapshot?.activeCards[0].agentConversations).toHaveLength(1))
        await service.agents.continueAgentConversation('design/F-1-root.md', 'design/activity/card__root-card.json#conversation=agent-1')

        expect(runElectronAction).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'md2.custom-prompt' }),
            expect.objectContaining({ file: 'design/F-1-root.md', kind: 'file' }),
            { continueFrom: 'design/activity/card__root-card.json#conversation=agent-1' },
        )
    })

    it('tracks desktop-owned scheduled runs only in the shared execution store', async () => {
        configService.init()
        let scheduledRunCallback: ((event: ActionExecutionEvent) => void) | null = null
        window.md2Actions = {
            onActionExecution: (callback: (event: ActionExecutionEvent) => void) => {
                scheduledRunCallback = callback

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        if (!scheduledRunCallback) throw new Error('Scheduled run callback not registered')
        const emitScheduledRun = scheduledRunCallback as (event: ActionExecutionEvent) => void

        const context = { cardInternalId: 'root-card', file: 'design/F-1-root.md', kind: 'card' as const }
        emitScheduledRun({ actionId: 'implement', context, executionId: 'schedule-1', phase: 'main', rootActionId: 'implement', status: 'running', type: 'execution' })
        expect(actionExecutionService.getRunningSnapshot()).toEqual([expect.objectContaining({ executionId: 'schedule-1' })])
        expect(service.getState().runningAgents).toEqual([])

        emitScheduledRun({ actionId: 'implement', context, executionId: 'schedule-1', phase: 'main', rootActionId: 'implement', status: 'completed', type: 'execution' })

        expect(actionExecutionService.getRunningSnapshot()).toHaveLength(0)
    })

    it('links the final conversation reference and loads it once', async () => {
        configService.init()
        let actionRunCallback: ((event: ActionExecutionEvent) => void) | null = null
        window.md2Actions = {
            onActionExecution: (callback: (event: ActionExecutionEvent) => void) => {
                actionRunCallback = callback

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        if (!actionRunCallback) throw new Error('Action run callback not registered')
        const emitActionRun = actionRunCallback as (event: ActionExecutionEvent) => void

        const context = { cardInternalId: 'root-card', file: 'design/F-1-root.md', kind: 'card' as const }
        emitActionRun({
            actionId: 'implement', context, executionId: 'action-1', executionWorktree: null, phase: 'main',
            reference: 'design/activity/card__root-card.json#conversation=agent-1', rootActionId: 'implement', status: 'completed', type: 'action',
        })

        await vi.waitFor(() => expect(storage.loadAgentConversation).toHaveBeenCalledTimes(1))
        await vi.waitFor(() => expect(service.getState().snapshot?.activeCards[0].agentConversations).toHaveLength(1))
        expect(service.getState().snapshot?.activeCards[0].header.agentLogReferences).toEqual(['design/activity/card__root-card.json#conversation=agent-1'])
    })
})

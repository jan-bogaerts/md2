import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation, AgentRunEvent, CommitRequest, MarkdownFile, StorageProjectFiles } from '../data/data_types'
import type { ActionExecutionEvent } from '../data/action_run_types'
import { runElectronAction } from './electron_action_runner'
import { configService } from './config_service'
import { DataService } from './data_service'
import { conversation, createDeferred, createStorage, waitForWorkerTurn } from './test_support/data_service_test_support'

vi.mock('./electron_action_runner', () => ({ runElectronAction: vi.fn(async () => ({ logs: [], status: 'completed' })) }))

describe('AgentIntegration', () => {
    afterEach(() => {
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
                name: 'ready-action',
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
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.moveCard('design/F-2-b.md', 'ready', 0)

        expect(runElectronAction).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'ready-action' }),
            expect.objectContaining({ file: 'design/F-2-b.md', kind: 'card', state: 'ready', type: 'feature' }),
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
                model: 'GPT 5.5',
                name: 'implement-action',
                onState: 'ready',
                prompt: 'Implement {{file}}',
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
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.moveCard('design/F-1-a.md', 'ready', 0)

        expect(runElectronAction).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'implement-action', thinkingLevel: 'high' }),
            expect.objectContaining({ file: 'design/F-1-a.md', kind: 'card', state: 'ready', type: 'feature' }),
        )
    })

    it('surfaces failed onState actions on the moved card', async () => {
        configService.init()
        vi.mocked(runElectronAction).mockResolvedValueOnce({
            logs: [{
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
                name: 'ready-action',
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
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.moveCard('design/F-2-b.md', 'ready', 0)

        await vi.waitFor(() => {
            const movedCard = service.getState().snapshot?.activeCards.find((card) => card.path === 'design/F-2-b.md')
            expect(movedCard?.agentConversationErrors).toEqual([
                { message: 'Ready failed with exit code 1', path: 'onState:ready-action' },
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
                name: 'todo-action',
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
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        service.cards.moveCard('design/F-2-b.md', 'todo', 0)

        expect(runElectronAction).not.toHaveBeenCalled()
    })

    it('loads referenced agent conversations onto cards', async () => {
        configService.init()
        const agentFiles: MarkdownFile[] = [
            {
                content: '---\nid: F-1\ntitle: Root\nstatus: active\nagents:\n  - .md2-agent-logs/one.json\n---\n\n# Root',
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
        const service = new DataService()
        service.init({ storage })

        const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(snapshot.activeCards[0].agentConversations).toHaveLength(0)
        conversationLoad.resolve(conversation())

        await vi.waitFor(() => {
            expect(service.getState().snapshot?.activeCards[0].agentConversations[0].title).toBe('Agent run')
        })
    })

    it('bounds parallel referenced agent conversation loads', async () => {
        configService.init()
        let activeLoads = 0
        let maxActiveLoads = 0
        const agentReferences = Array.from({ length: 10 }, (_item, index) => `.md2-agent-logs/${index}.json`)
        const agentFile: MarkdownFile = {
            content: [
                '---',
                'id: F-1',
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
        const service = new DataService()
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
                content: '---\nid: F-1\ntitle: Root\nstatus: active\nagents:\n  - .md2-agent-logs/missing.json\n---\n\n# Root',
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
        const service = new DataService()
        service.init({ storage })

        const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(snapshot.activeCards[0].header.title).toBe('Root')
        expect(snapshot.activeCards[0].agentConversationErrors).toEqual([])

        await vi.waitFor(() => {
            expect(service.getState().snapshot?.activeCards[0].agentConversationErrors).toEqual([
                { message: 'Agent log not found', path: '.md2-agent-logs/missing.json' },
            ])
        })
    })

    it('continues a conversation and links the returned streaming log to the card header', async () => {
        configService.init()
        const continuedConversation = { ...conversation('.md2-agent-logs/two.json'), id: 'agent-2', status: 'running' as const }
        const storage = createStorage({
            startAgentConversation: vi.fn(async () => ({
                conversation: continuedConversation,
                reference: '.md2-agent-logs/two.json',
                runId: 'agent-2',
            })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.agents.continueAgentConversation('design/F-1-root.md', '.md2-agent-logs/one.json')
        await service.cards.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content).toContain('agents:\n  - .md2-agent-logs/two.json')
        expect(storage.startAgentConversation).toHaveBeenCalledWith(
            { branch: 'main', id: 'project' },
            {
                cardPath: 'design/F-1-root.md',
                continuedFrom: '.md2-agent-logs/one.json',
                nativeResumeSessionId: undefined,
                prompt: expect.stringContaining('agent: done'),
                title: 'Continue',
            },
            expect.any(Function),
        )
    })

    it('uses native resume when the source conversation has a native session id', async () => {
        configService.init()
        const sourceConversation = { ...conversation('.md2-agent-logs/one.json'), nativeSessionId: 'session-1' }
        const storage = createStorage({
            loadAgentConversation: vi.fn(async () => sourceConversation),
            startAgentConversation: vi.fn(async () => ({
                conversation: { ...conversation('.md2-agent-logs/two.json'), continuedFrom: '.md2-agent-logs/one.json', id: 'agent-2' },
                reference: '.md2-agent-logs/two.json',
                runId: 'agent-2',
            })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.agents.continueAgentConversation('design/F-1-root.md', '.md2-agent-logs/one.json')

        expect(storage.startAgentConversation).toHaveBeenCalledWith(
            { branch: 'main', id: 'project' },
            {
                cardPath: 'design/F-1-root.md',
                continuedFrom: '.md2-agent-logs/one.json',
                nativeResumeSessionId: 'session-1',
                prompt: 'continue',
                title: 'Continue',
            },
            expect.any(Function),
        )
    })

    it('reports running agent state from streaming continue events', async () => {
        configService.init()
        const callbacks: Array<(event: AgentRunEvent) => void> = []
        const storage = createStorage({
            startAgentConversation: vi.fn(async (_project, _request, callback) => {
                callbacks.push(callback)
                const runningConversation: AgentConversation = { ...conversation('.md2-agent-logs/two.json'), id: 'agent-2', status: 'running' }

                return { conversation: runningConversation, reference: '.md2-agent-logs/two.json', runId: 'agent-2' }
            }),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.agents.continueAgentConversation('design/F-1-root.md', '.md2-agent-logs/one.json')
        if (!callbacks[0]) throw new Error('Streaming callback not registered')

        callbacks[0]({ content: '', conversation: { ...conversation(), id: 'agent-2', status: 'running' }, runId: 'agent-2', type: 'started' })
        expect(service.getState().runningAgents).toHaveLength(1)

        callbacks[0]({ content: '0', conversation: { ...conversation(), id: 'agent-2', status: 'completed' }, runId: 'agent-2', type: 'closed' })

        expect(service.getState().runningAgents).toHaveLength(0)
    })

    it('reports desktop-owned scheduled action runs in running agent state', async () => {
        configService.init()
        let scheduledRunCallback: ((event: ActionExecutionEvent) => void) | null = null
        window.md2Actions = {
            onActionExecution: (callback: (event: ActionExecutionEvent) => void) => {
                scheduledRunCallback = callback

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        if (!scheduledRunCallback) throw new Error('Scheduled run callback not registered')
        const emitScheduledRun = scheduledRunCallback as (event: ActionExecutionEvent) => void

        emitScheduledRun({ actionId: 'implement', executionId: 'schedule-1', phase: 'main', rootActionId: 'implement', status: 'running', type: 'execution' })
        expect(service.getState().runningAgents).toEqual([expect.objectContaining({ label: 'Action implement' })])

        emitScheduledRun({ actionId: 'implement', executionId: 'schedule-1', phase: 'main', rootActionId: 'implement', status: 'completed', type: 'execution' })

        expect(service.getState().runningAgents).toHaveLength(0)
    })

    it('records and links action agent events through one global consumer', () => {
        configService.init()
        let actionRunCallback: ((event: ActionExecutionEvent) => void) | null = null
        window.md2Actions = {
            onActionExecution: (callback: (event: ActionExecutionEvent) => void) => {
                actionRunCallback = callback

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        const service = new DataService()
        service.init({ storage: createStorage() })
        const recordAgentRunEvent = vi.spyOn(service.agents, 'recordAgentRunEvent').mockImplementation(() => undefined)
        const linkAgentConversation = vi.spyOn(service.agents, 'linkAgentConversation').mockImplementation((file) => ({ content: '', path: file }))
        if (!actionRunCallback) throw new Error('Action run callback not registered')
        const emitActionRun = actionRunCallback as (event: ActionExecutionEvent) => void
        const agentConversation = { ...conversation(), cardPath: 'design/F-1-root.md' }
        const agentEvent: AgentRunEvent = { content: 'output', conversation: agentConversation, runId: 'agent-1', type: 'output' }

        emitActionRun({actionId: 'implement', agentEvent, executionId: 'action-1', phase: 'main', rootActionId: 'implement', status: 'running', type: 'agent'})
        emitActionRun({
            actionId: 'implement', conversation: agentConversation, executionId: 'action-1', executionWorktree: null,
            phase: 'main', reference: '.md2-agent-logs/one.json', rootActionId: 'implement', status: 'completed', type: 'action',
        })

        expect(recordAgentRunEvent).toHaveBeenCalledTimes(1)
        expect(linkAgentConversation).toHaveBeenCalledTimes(1)
        expect(linkAgentConversation).toHaveBeenCalledWith('design/F-1-root.md', agentConversation, '.md2-agent-logs/one.json')
    })
})

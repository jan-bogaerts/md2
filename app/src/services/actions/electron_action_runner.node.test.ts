import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../data/action_types'
import type { ActionRunEvent } from '../../data/action_run_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { dataService } from '../data/data_service'
import { projectPersistenceService } from '../project/project_persistence_service'
import { actionRunRegistry } from './action_run_registry'
import { cancelElectronAction, runElectronAction } from './electron_action_runner'

const action: ActionDefinition = {
    agent: null,
    appliesTo: null,
    permissionMode: null,
    builtin: false,
    command: 'renderer must not send this',
    description: 'Run tests',
    editorState: { phrases: [], selectedTab: 'prompt' },
    icon: null,
    id: 'test',
    label: 'Test',
    model: null,
    needsWorkTree: false,
    on: [],
    onAfter: [],
    onBefore: [],
    onState: null,
    output: null,
    phrases: [],
    prompt: null,
    showCommandWindow: false,
    sourcePath: 'actions/test.json',
    thinkingLevel: null,
    trackFileChanges: false,
    streaming: false,
    type: 'command',
}
const agentAction: ActionDefinition = { ...action, command: null, id: 'agent-test', type: 'agent' }
const context = { file: 'design/F-1.md', kind: 'card' as const }

function createBridge(changedPaths: string[] = []): ElectronActionBridge {
    let callback: ((event: ActionRunEvent) => void) | null = null

    return {
        cancelActionRun: vi.fn(async () => {}),
        generateDiff: vi.fn(async () => ({ commit: '', files: [] })),
        generateWorktreeDiff: vi.fn(async () => ({ files: [], repositoryRoot: 'C:/worktree' })),
        loadActionRunHistory: vi.fn(async () => []),
        onActionRun: vi.fn((listener) => {
            callback = listener

            return vi.fn()
        }),
        openInEditor: vi.fn(async () => {}),
        prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        runSearchRegexpAgent: vi.fn(),
        startAction: vi.fn(async (request) => {
            const eventContext = request.context
            const emit = callback as unknown as (event: ActionRunEvent) => void
            emit({
                actionId: 'test', command: 'npm test', context: eventContext, runId: 'action-1', phase: 'main', rootActionId: 'test',
                status: 'running', type: 'action',
            })
            emit({
                actionId: 'test', context: eventContext, runId: 'action-1', phase: 'main', rootActionId: 'test', status: 'running', type: 'update',
                update: { content: 'ok', kind: 'output' },
            })
            emit({
                actionId: 'test', command: 'npm test', context: eventContext, runId: 'action-1', phase: 'main', rootActionId: 'test',
                status: 'completed', type: 'action',
            })
            emit({ actionId: 'test', changedPaths, context: eventContext, runId: 'action-1', phase: 'main', rootActionId: 'test', status: 'completed', type: 'run' })

            return 'action-1'
        }),
    }
}

describe('electron action runner client', () => {
    afterEach(() => {
        actionRunRegistry.stop()
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

    it('sends only action id, context, and run-specific input and collects phase events', async () => {
        const bridge = createBridge()
        setActionBridgeOverride(bridge)
        const reloadCurrentProjectSnapshot = vi.spyOn(dataService.projectLoading, 'reloadCurrentProjectSnapshot')

        const result = await runElectronAction(action, context, { extraPrompt: 'focus' })

        expect(bridge.startAction).toHaveBeenCalledWith({ actionId: 'test', context, runInput: { extraPrompt: 'focus' } })
        expect(reloadCurrentProjectSnapshot).not.toHaveBeenCalled()
        expect(result).toEqual({
            changedPaths: [],
            logs: [{ actionId: 'test', actionName: 'test', command: 'npm test', message: 'test completed', phase: 'main', status: 'completed', stderr: '', stdout: 'ok' }],
            status: 'completed',
        })
    })

    it('flushes pending card edits before starting the action', async () => {
        const bridge = createBridge()
        setActionBridgeOverride(bridge)
        const snapshot = projectPersistenceService.getSnapshot()
        vi.spyOn(projectPersistenceService, 'getSnapshot').mockReturnValue({ ...snapshot, hasPendingSave: true })
        const flush = vi.spyOn(projectPersistenceService, 'flushPendingChanges').mockImplementation(async () => {
            expect(bridge.startAction).not.toHaveBeenCalled()
        })

        await runElectronAction(action, context)

        expect(flush).toHaveBeenCalledTimes(1)
    })

    it('applies terminal changed paths to card owner after action completion', async () => {
        const bridge = createBridge(['app/a.ts', 'desktop/b.js'])
        setActionBridgeOverride(bridge)
        const cardContext = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' as const }
        const addCardChangedFiles = vi.spyOn(dataService.cards, 'addCardChangedFiles').mockImplementation(() => null as never)

        await runElectronAction(action, cardContext)

        expect(addCardChangedFiles).toHaveBeenCalledWith(
            cardContext.cardInternalId,
            cardContext.file,
            ['app/a.ts', 'desktop/b.js'],
        )
    })

    it('does not touch card owner when terminal run has no changed paths', async () => {
        const bridge = createBridge()
        setActionBridgeOverride(bridge)
        const cardContext = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' as const }
        const addCardChangedFiles = vi.spyOn(dataService.cards, 'addCardChangedFiles')

        await runElectronAction(action, cardContext)

        expect(addCardChangedFiles).not.toHaveBeenCalled()
    })

    it('does not start the action when flushing pending changes fails', async () => {
        const bridge = createBridge()
        const failure = new Error('commit failed')
        setActionBridgeOverride(bridge)
        const snapshot = projectPersistenceService.getSnapshot()
        vi.spyOn(projectPersistenceService, 'getSnapshot').mockReturnValue({ ...snapshot, hasPendingSave: true })
        vi.spyOn(projectPersistenceService, 'flushPendingChanges').mockRejectedValue(failure)

        await expect(runElectronAction(action, context)).rejects.toBe(failure)

        expect(bridge.startAction).not.toHaveBeenCalled()
    })

    it('links a reserved card conversation before flushing and starting the agent', async () => {
        const bridge = createBridge()
        const reservation = {
            activityPath: 'design/activity/card__card-1.json',
            conversationId: 'agent-1',
            reference: 'design/activity/card__card-1.json#conversation=agent-1',
        }
        bridge.reserveActionConversation = vi.fn(async () => reservation)
        setActionBridgeOverride(bridge)
        const cardContext = { cardInternalId: 'card-1', file: 'design/F-1.md', kind: 'card' as const }
        const addReference = vi.spyOn(dataService.cards, 'addAgentLogReference').mockReturnValue('card-1')
        const resumeAutomaticCommit = vi.fn()
        vi.spyOn(dataService.cards, 'deferAutomaticCommit').mockReturnValue(resumeAutomaticCommit)
        const snapshot = projectPersistenceService.getSnapshot()
        vi.spyOn(projectPersistenceService, 'getSnapshot').mockReturnValue({ ...snapshot, hasPendingSave: true })
        const flush = vi.spyOn(projectPersistenceService, 'flushPendingChanges').mockResolvedValue()

        await runElectronAction(agentAction, cardContext)

        expect(bridge.reserveActionConversation).toHaveBeenCalledWith({ actionId: agentAction.id, context: cardContext, runInput: {} })
        expect(addReference).toHaveBeenCalledWith(cardContext.file, reservation.activityPath)
        expect(bridge.startAction).toHaveBeenCalledWith({
            actionId: agentAction.id,
            context: cardContext,
            conversationReservation: reservation,
            runInput: {},
        })
        const reservationOrder = vi.mocked(bridge.reserveActionConversation).mock.invocationCallOrder[0]
        expect(reservationOrder).toBeLessThan(addReference.mock.invocationCallOrder[0])
        expect(addReference.mock.invocationCallOrder[0]).toBeLessThan(flush.mock.invocationCallOrder[0])
        expect(resumeAutomaticCommit.mock.invocationCallOrder[0]).toBeLessThan(flush.mock.invocationCallOrder[0])
        expect(flush.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(bridge.startAction).mock.invocationCallOrder[0])
    })

    it('does not flush when no card edits are pending', async () => {
        const bridge = createBridge()
        setActionBridgeOverride(bridge)
        vi.spyOn(projectPersistenceService, 'getSnapshot').mockReturnValue({ hasPendingPush: false, hasPendingSave: false, localSaveState: 'saved' })
        const flush = vi.spyOn(projectPersistenceService, 'flushPendingChanges').mockResolvedValue()

        await runElectronAction(action, context)

        expect(flush).not.toHaveBeenCalled()
    })

    it('cancels by Electron run ID', async () => {
        const bridge = createBridge()
        setActionBridgeOverride(bridge)

        await cancelElectronAction('action-1')

        expect(bridge.cancelActionRun).toHaveBeenCalledWith('action-1')
    })

    it('reuses one shared subscription across successful runs', async () => {
        const bridge = createBridge()
        setActionBridgeOverride(bridge)

        await runElectronAction(action, context)
        await runElectronAction(action, context)

        expect(bridge.onActionRun).toHaveBeenCalledTimes(1)
    })
})

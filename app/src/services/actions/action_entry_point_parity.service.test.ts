import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent, ActionStartRequest } from '../../data/action_run_types'
import { actionService } from './action_service'
import { actionRunRegistry } from './action_run_registry'
import { configService } from '../config/config_service'
import { runElectronAction } from './electron_action_runner'
import { createDataService, createStorage } from '../test_support/data_service_test_support'

describe('action entry-point parity', () => {
    afterEach(() => {
        actionRunRegistry.stop()
        delete window.md2Actions
        configService.clear()
        vi.restoreAllMocks()
    })

    it('delegates manual and onState runs through identical Electron requests', async () => {
        configService.init()
        const listeners = new Set<(event: ActionRunEvent) => void>()
        const requests: ActionStartRequest[] = []
        window.md2Actions = {
            onActionRun: (listener: (event: ActionRunEvent) => void) => {
                listeners.add(listener)

                return () => listeners.delete(listener)
            },
            startAction: async (request: ActionStartRequest) => {
                requests.push(request)
                const runId = `action-${requests.length}`
                const actionEvent: ActionRunEvent = {
                    actionId: request.actionId, command: 'run', context: request.context, runId, phase: 'main', rootActionId: request.actionId,
                    status: 'completed', type: 'action',
                }
                const runEvent: ActionRunEvent = {
                    actionId: request.actionId, context: request.context, runId, phase: 'main', rootActionId: request.actionId,
                    status: 'completed', type: 'run',
                }
                for (const listener of listeners) listener(actionEvent)
                for (const listener of listeners) listener(runEvent)

                return runId
            },
        } as unknown as typeof window.md2Actions
        const bridge = window.md2Actions
        if (!bridge) throw new Error('Missing action bridge')
        bridge.startUnattendedAction = bridge.startAction
        const cardFile = { content: '---\nid: F-1\ninternalId: a\ntitle: A\nstatus: todo\n---\n\n# A', path: 'design/F-1-a.md' }
        const actionFile = {
            content: JSON.stringify({command: 'run', description: 'Ready', id: 'action-ready', label: 'Ready', onState: 'ready', type: 'command'}),
            path: 'actions/ready.json',
        }
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => [actionFile]),
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const action = actionService.getActions().find((candidate) => candidate.id === 'action-ready')
        if (!action) throw new Error('Action not loaded')
        const context = { cardInternalId: 'a', file: cardFile.path, kind: 'card' as const, state: 'ready', title: 'A', type: 'feature' }

        const manualResult = await runElectronAction(action, context)
        service.cards.moveCard(cardFile.path, 'ready', 0)
        await vi.waitFor(() => expect(requests).toHaveLength(2))

        expect(requests).toEqual([
            { actionId: action.id, context, runInput: {} },
            { actionId: action.id, context, runInput: {} },
        ])
        expect(manualResult.status).toBe('completed')
    })
})

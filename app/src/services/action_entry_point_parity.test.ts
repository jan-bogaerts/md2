import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionExecutionEvent, ActionStartRequest } from '../data/action_run_types'
import { actionService } from './action_service'
import { configService } from './config_service'
import { DataService, dataService } from './data_service'
import { runElectronAction } from './electron_action_runner'
import { createStorage } from './test_support/data_service_test_support'

describe('action entry-point parity', () => {
    afterEach(() => {
        delete window.md2Actions
        configService.clear()
        vi.restoreAllMocks()
    })

    it('delegates manual and onState runs through identical Electron requests', async () => {
        configService.init()
        const listeners = new Set<(event: ActionExecutionEvent) => void>()
        const requests: ActionStartRequest[] = []
        window.md2Actions = {
            onActionExecution: (listener: (event: ActionExecutionEvent) => void) => {
                listeners.add(listener)

                return () => listeners.delete(listener)
            },
            startAction: async (request: ActionStartRequest) => {
                requests.push(request)
                const executionId = `action-${requests.length}`
                const actionEvent: ActionExecutionEvent = {
                    actionId: request.actionId, command: 'run', executionId, phase: 'main', rootActionId: request.actionId,
                    status: 'completed', stderr: '', stdout: 'done', type: 'action',
                }
                const executionEvent: ActionExecutionEvent = {actionId: request.actionId, executionId, phase: 'main', rootActionId: request.actionId, status: 'completed', type: 'execution'}
                for (const listener of listeners) listener(actionEvent)
                for (const listener of listeners) listener(executionEvent)

                return executionId
            },
        } as unknown as typeof window.md2Actions
        vi.spyOn(dataService.projectLoading, 'reloadCurrentProjectSnapshot').mockResolvedValue(null)
        const cardFile = { content: '---\nid: F-1\ninternalId: a\ntitle: A\nstatus: todo\n---\n\n# A', path: 'design/F-1-a.md' }
        const actionFile = {
            content: JSON.stringify({command: 'run', description: 'Ready', id: 'action-ready', label: 'Ready', name: 'ready-action', onState: 'ready', type: 'command'}),
            path: 'actions/ready.json',
        }
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => [actionFile]),
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const action = actionService.getActions().find((candidate) => candidate.id === 'action-ready')
        if (!action) throw new Error('Action not loaded')
        const context = { file: cardFile.path, kind: 'card' as const, state: 'ready', type: 'feature' }

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

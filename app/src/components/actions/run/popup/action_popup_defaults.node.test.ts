import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../../../data/action_types'
import type { ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { projectPersistenceService } from '../../../../services/project/project_persistence_service'
import { defaultPreparePrompt } from './action_popup_defaults'

const action = {id: 'review'} as ActionDefinition
const context = { file: 'design/F-1.md', kind: 'card' as const }

describe('action popup defaults', () => {
    afterEach(() => {
        delete window.md2Actions
        vi.restoreAllMocks()
    })

    it('flushes aggregate pending persistence before preparing the prompt', async () => {
        const calls: string[] = []
        vi.spyOn(projectPersistenceService, 'flushPendingChanges').mockImplementation(async () => {
            calls.push('persistence')
        })
        window.md2Actions = {
            prepareActionPrompt: vi.fn(async () => {
                calls.push('prepare')
                return { prompt: 'Current prompt' }
            }),
        } as unknown as ElectronActionBridge

        await expect(defaultPreparePrompt(action, context)).resolves.toEqual({ prompt: 'Current prompt' })

        expect(calls).toEqual(['persistence', 'prepare'])
    })

    it('does not prepare the prompt when pending persistence fails', async () => {
        const saveError = new Error('disk unavailable')
        vi.spyOn(projectPersistenceService, 'flushPendingChanges').mockRejectedValue(saveError)
        const prepareActionPrompt = vi.fn(async () => ({ prompt: 'Stale prompt' }))
        window.md2Actions = { prepareActionPrompt } as unknown as ElectronActionBridge

        await expect(defaultPreparePrompt(action, context)).rejects.toBe(saveError)

        expect(prepareActionPrompt).not.toHaveBeenCalled()
    })
})

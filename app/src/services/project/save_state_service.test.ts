import { describe, expect, it, vi } from 'vitest'
import { SaveStateService, withSaveStateTracking } from './save_state_service'
import { createDeferred, createStorage } from '.././test_support/data_service_test_support'

describe('SaveStateService', () => {
    it('stays pending until all overlapping saves finish', () => {
        const service = new SaveStateService()
        const finishFirst = service.beginSave()
        const finishSecond = service.beginSave()

        expect(service.getState().isSaving).toBe(true)
        finishFirst()
        expect(service.getState().isSaving).toBe(true)
        finishSecond()
        expect(service.getState().isSaving).toBe(false)
    })

    it('tracks storage commits through success and failure', async () => {
        const pendingCommit = createDeferred<never[]>()
        const commit = vi.fn(() => pendingCommit.promise)
        const service = new SaveStateService()
        const storage = withSaveStateTracking(createStorage({ commit }), service)

        const result = storage.commit({ branch: 'main', files: [], message: 'Save action' })
        expect(service.getState().isSaving).toBe(true)

        pendingCommit.resolve([])
        await result
        expect(service.getState().isSaving).toBe(false)

        commit.mockRejectedValueOnce(new Error('disk unavailable'))
        await expect(storage.commit({ branch: 'main', files: [], message: 'Retry action' })).rejects.toThrow('disk unavailable')
        expect(service.getState().isSaving).toBe(false)
    })

    it('tracks linked worktree mutations', async () => {
        const pendingAddition = createDeferred<boolean>()
        const addWorktree = vi.fn(() => pendingAddition.promise)
        const service = new SaveStateService()
        const storage = withSaveStateTracking(createStorage({ addWorktree }), service)
        const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

        const result = storage.addWorktree?.(project)
        expect(service.getState().isSaving).toBe(true)

        pendingAddition.resolve(true)
        await result
        expect(service.getState().isSaving).toBe(false)
    })
})

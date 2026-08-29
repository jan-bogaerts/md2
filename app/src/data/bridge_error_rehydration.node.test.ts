import { describe, expect, it } from 'vitest'
import { serializeBridgeError } from '../../../shared/bridge_errors.mjs'
import { MissingWorkingFolderError } from './data_types'
import { rehydrateBridgeError, unwrapBridgeResult, withBridgeErrorRehydration } from './bridge_error_rehydration'
import { LocalGitStorageService } from '../services/data/local_git_storage_service'
import type { ElectronDataBridge } from './electron_data_bridge'

function createMainProcessMissingWorkingFolderError(workingFolder: string) {
    const error = new Error(`Working folder is missing: ${workingFolder}`) as Error & { code?: string; workingFolder?: string }
    error.code = 'missing-working-folder'
    error.workingFolder = workingFolder

    return error
}

/**
 * Mimics the Electron IPC boundary: the main-process value is structured-cloned to the renderer,
 * which drops class identity and any property that is not part of the cloned data.
 */
function crossIpcBoundary<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

describe('bridge error rehydration across the IPC boundary', () => {
    it('rebuilds a MissingWorkingFolderError from the envelope the main process resolves with', () => {
        const envelope = crossIpcBoundary(serializeBridgeError(createMainProcessMissingWorkingFolderError('design/feature_descriptions')))

        expect(() => unwrapBridgeResult(envelope)).toThrow(MissingWorkingFolderError)
        try {
            unwrapBridgeResult(envelope)
        } catch (error) {
            const missingWorkingFolderError = error as MissingWorkingFolderError

            expect(missingWorkingFolderError.code).toBe('missing-working-folder')
            expect(missingWorkingFolderError.workingFolder).toBe('design/feature_descriptions')
            expect(missingWorkingFolderError.message).toBe('Working folder is missing: design/feature_descriptions')
        }
    })

    it('keeps the code of an unrelated marked error instead of reducing it to a message', () => {
        const marked = new Error('Working folder is outside the repository') as Error & { code?: string }
        marked.code = 'outside-repository-root'
        const payload = crossIpcBoundary(serializeBridgeError(marked)).__md2BridgeError
        const rehydrated = rehydrateBridgeError(payload) as Error & { code?: string }

        expect(rehydrated.code).toBe('outside-repository-root')
        expect(rehydrated.message).toBe('Working folder is outside the repository')
    })

    it('passes ordinary bridge results through untouched', () => {
        const result = { files: [{ content: '# card', path: 'design/active/card.md' }], workingFolder: 'design/active' }

        expect(unwrapBridgeResult(crossIpcBoundary(result))).toEqual(result)
    })

    it('fails fast for a malformed bridge error envelope', () => {
        expect(() => unwrapBridgeResult({ __md2BridgeError: { message: 'broken' } }))
            .toThrow('Invalid bridge error envelope')
    })

    it('throws the typed error out of LocalGitStorageService.loadProject', async () => {
        const bridge = {
            loadProject: async () => (
                crossIpcBoundary(serializeBridgeError(createMainProcessMissingWorkingFolderError('design/active')))
            ),
        } as unknown as ElectronDataBridge
        const storage = new LocalGitStorageService()
        storage.init({ bridge })

        await expect(storage.loadProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' }, 'design/active'))
            .rejects.toBeInstanceOf(MissingWorkingFolderError)
    })

    it('leaves non-function bridge members in place when wrapping', () => {
        const wrapped = withBridgeErrorRehydration({ label: 'bridge', run: () => 'ok' })

        expect(wrapped.label).toBe('bridge')
        expect(wrapped.run()).toBe('ok')
    })

    it('unwraps a promise-like result from another JavaScript realm', async () => {
        const envelope = serializeBridgeError(createMainProcessMissingWorkingFolderError('design/active'))
        const bridge = {load: () => ({ then: (resolve: (value: unknown) => void) => resolve(envelope) })}
        const wrapped = withBridgeErrorRehydration(bridge)

        await expect(wrapped.load()).rejects.toBeInstanceOf(MissingWorkingFolderError)
    })
})

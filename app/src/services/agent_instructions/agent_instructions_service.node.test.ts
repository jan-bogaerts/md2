import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectReference, StorageService } from '../../data/data_types'
import { DIALOG_SERVICE_EVENT, dialogService, type DialogServiceMessage } from '../dialog_service'
import { createDeferred, createStorage } from '../test_support/data_service_test_support'
import { AgentInstructionsService } from './agent_instructions_service'

const PROJECT: ProjectReference = { branch: 'main', id: 'project' }

describe('AgentInstructionsService', () => {
    afterEach(() => vi.restoreAllMocks())

    it('loads independently, sorts files, and retains per-file failures', async () => {
        const warnings: string[] = []
        const handleWarning = (event: Event) => {
            const message = (event as CustomEvent<DialogServiceMessage>).detail
            if (message.severity === 'warning') warnings.push(message.message)
        }
        dialogService.addEventListener(DIALOG_SERVICE_EVENT, handleWarning)
        const storage = createStorage({
            loadTextFile: vi.fn(async (_project, path) => {
                if (path === 'CLAUDE.md') throw new Error('read denied')

                return { content: path, path }
            }),
        })
        const service = new AgentInstructionsService()

        try {
            await service.load(PROJECT, ['docs/AGENTS.md', 'CLAUDE.md', 'README.md'], storage)

            expect(service.getSnapshot().files.map(({ path }) => path)).toEqual(['docs/AGENTS.md', 'README.md'])
            expect(service.getSnapshot().errors).toEqual([{ message: 'read denied', path: 'CLAUDE.md' }])
            expect(warnings).toEqual(['Agent instruction CLAUDE.md could not be loaded and was skipped. read denied'])
        } finally {
            dialogService.removeEventListener(DIALOG_SERVICE_EVENT, handleWarning)
        }
    })

    it('rejects stale asynchronous results after project switch', async () => {
        const deferred = createDeferred<{ content: string, path: string }>()
        const storage = createStorage({ loadTextFile: vi.fn(async () => deferred.promise) })
        const service = new AgentInstructionsService()
        const loading = service.load(PROJECT, ['README.md'], storage)

        service.setProject({ branch: 'other', id: 'project' })
        deferred.resolve({ content: 'stale', path: 'README.md' })
        await loading

        expect(service.getSnapshot()).toEqual({ errors: [], files: [], projectKey: 'project:other' })
    })

    it('records a clear capability error when text loading is unavailable', async () => {
        const storage = createStorage()
        delete (storage as Partial<StorageService>).loadTextFile
        const service = new AgentInstructionsService()

        await service.load(PROJECT, ['README.md'], storage)

        expect(service.getSnapshot().errors).toEqual([
            { message: 'Storage does not support text-file loading', path: null },
        ])
    })
})

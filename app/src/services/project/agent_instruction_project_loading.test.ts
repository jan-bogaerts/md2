import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectWatchEvent } from '../../data/data_types'
import { agentInstructionsService } from '../agent_instructions/agent_instructions_service'
import { actionService } from '../actions/action_service'
import { configService } from '../config/config_service'
import { DIALOG_SERVICE_EVENT, dialogService, type DialogServiceMessage } from '../dialog_service'
import { openFilesService } from '../open_files_service'
import { createDataService, createStorage, files } from '../test_support/data_service_test_support'

describe('project agent instructions', () => {
    afterEach(() => {
        for (const document of openFilesService.getRegisteredDocuments()) openFilesService.discardDocument(document)
        agentInstructionsService.clear()
        actionService.clear()
        configService.clear()
        vi.restoreAllMocks()
    })

    it('loads Git-visible instructions while excluding them from cards and repository tree input', async () => {
        configService.init()
        const card = files[0]
        const instructionFiles = [
            { content: '# Root guidance', path: 'README.md' },
            { content: '# Project agents', path: 'design/AGENTS.md' },
            { content: '# Project readme', path: 'design/README.txt' },
        ]
        const allProjectFiles = [card, ...instructionFiles.slice(1)]
        const contentByPath = new Map(instructionFiles.map((file) => [file.path, file.content]))
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => [card.path, ...instructionFiles.map(({ path }) => path)]),
            loadProject: vi.fn(async () => ({ files: allProjectFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: allProjectFiles, workingFolder: 'design' })),
            loadTextFile: vi.fn(async (_project, path) => ({ content: contentByPath.get(path) ?? '', path })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(service.getState().snapshot?.activeCards.map(({ path }) => path)).toEqual([card.path])
        await vi.waitFor(() => expect(agentInstructionsService.getSnapshot().files).toHaveLength(3))
        expect(agentInstructionsService.getSnapshot().files.map(({ path }) => path)).toEqual([
            'design/AGENTS.md',
            'design/README.txt',
            'README.md',
        ])
        expect(service.getState().snapshot?.repositoryFiles).toEqual([card.path])
        expect(service.getState().snapshot?.backgroundCards).toEqual([])
    })

    it('reloads clean instructions and preserves dirty drafts on external change', async () => {
        configService.init()
        let instructionContent = '# Initial'
        let watchChange: (event: ProjectWatchEvent) => void = () => undefined
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => ['README.md']),
            loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadTextFile: vi.fn(async (_project, path) => ({ content: instructionContent, path })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await vi.waitFor(() => expect(agentInstructionsService.getFile('README.md')).not.toBeNull())
        const file = agentInstructionsService.getFile('README.md')
        if (!file) throw new Error('Missing loaded instruction')
        const document = openFilesService.openDocument(file)
        if (document.kind !== 'instruction') throw new Error('Expected instruction document')

        instructionContent = '# External clean'
        watchChange({ changeKind: 'changed', path: 'README.md' })
        await vi.waitFor(() => expect(document.getDraft().content).toBe('# External clean'))

        document.updateDraft({ content: '# Local draft' }, 'list-instruction')
        const errors: string[] = []
        const handleDialog = (event: Event) => {
            const message = (event as CustomEvent<DialogServiceMessage>).detail
            if (message.severity === 'error') errors.push(message.message)
        }
        dialogService.addEventListener(DIALOG_SERVICE_EVENT, handleDialog)
        try {
            instructionContent = '# External conflict'
            watchChange({ changeKind: 'changed', path: 'README.md' })

            await vi.waitFor(() => expect(errors).toContain(
                'External change ignored for README.md because the file has unsaved local edits.',
            ))
            expect(document.getDraft().content).toBe('# Local draft')
        } finally {
            dialogService.removeEventListener(DIALOG_SERVICE_EVENT, handleDialog)
        }
    })

    it('removes a clean instruction document when its file disappears', async () => {
        configService.init()
        let watchChange: (event: ProjectWatchEvent) => void = () => undefined
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => ['README.md']),
            loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadTextFile: vi.fn(async (_project, path) => ({ content: '# Initial', path })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await vi.waitFor(() => expect(agentInstructionsService.getFile('README.md')).not.toBeNull())
        const file = agentInstructionsService.getFile('README.md')
        if (!file) throw new Error('Missing loaded instruction')
        openFilesService.openDocument(file)

        watchChange({ changeKind: 'removed', path: 'README.md' })

        await vi.waitFor(() => expect(agentInstructionsService.getFile('README.md')).toBeNull())
        expect(openFilesService.getSnapshot()).toEqual({ activeDocument: null, documents: [] })
    })

    it('defers newly added instruction discovery until project reload', async () => {
        configService.init()
        let repositoryFiles: string[] = []
        let watchChange: (event: ProjectWatchEvent) => void = () => undefined
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => repositoryFiles),
            loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadTextFile: vi.fn(async (_project, path) => ({ content: '# New', path })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await vi.waitFor(() => expect(service.getState().snapshot?.repositoryFiles).toEqual([]))

        repositoryFiles = ['.github/copilot-instructions.md']
        watchChange({ changeKind: 'added', path: '.github/copilot-instructions.md' })
        expect(agentInstructionsService.getSnapshot().files).toEqual([])

        await service.projectLoading.reloadCurrentProjectSnapshot()

        expect(agentInstructionsService.getSnapshot().files).toEqual([
            { content: '# New', path: '.github/copilot-instructions.md' },
        ])
    })
})

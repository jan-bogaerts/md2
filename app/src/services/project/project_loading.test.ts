import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_STATES, defaultColumnAccent, type StorageProjectFiles, type StorageService } from '../../data/data_types'
import type { RawActionDefinition } from '../../data/action_types'
import { actionService } from '../actions/action_service'
import { configService } from '../config/config_service'
import { DataService } from '../data/data_service'
import { DIALOG_SERVICE_EVENT, dialogService, type DialogServiceMessage, type DialogSeverity } from '.././dialog_service'
import { telemetryService } from '../telemetry/telemetry_service'
import { GLOBAL_PROGRESS_EVENT, globalProgressService, type GlobalProgress } from '.././global_progress_service'
import { createDeferred, createStorage, files, storageFiles, waitForWorkerTurn } from '.././test_support/data_service_test_support'
import { markdownParsingService } from '../data/markdown_parsing_service'

function actionDefinition(id: string, overrides: Record<string, unknown> = {}): RawActionDefinition {
    return { command: 'run', description: id, id: `action-${id}`, label: id, type: 'command', ...overrides } as RawActionDefinition
}

function recordDialogMessages(severity: DialogSeverity) {
    const messages: string[] = []
    const handleDialogMessage = (event: Event) => {
        const message = (event as CustomEvent<DialogServiceMessage>).detail
        if (message.severity === severity) messages.push(message.message)
    }
    dialogService.addEventListener(DIALOG_SERVICE_EVENT, handleDialogMessage)

    return {
        messages,
        stop: () => dialogService.removeEventListener(DIALOG_SERVICE_EVENT, handleDialogMessage),
    }
}

describe('ProjectLoading', () => {
    afterEach(() => {
        vi.useRealTimers()
        delete window.md2Actions
        actionService.clear()
        configService.clear()
        globalProgressService.finish()
    })

    it('blocks project navigation while an invalid action draft remains unsaved', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'first' })
        actionService.loadFromFiles([{
            content: JSON.stringify(actionDefinition('run')),
            path: 'actions/run.json',
        }])
        actionService.updateDraft('actions/run.json', { ...actionDefinition('run'), label: '' })

        await expect(service.projectLoading.openProject({ branch: 'main', id: 'second' }))
            .rejects.toThrow(/invalid unsaved changes/u)

        expect(service.getState().project?.id).toBe('first')
        expect(actionService.getDraft('actions/run.json').definition.label).toBe('')
    })

    it('blocks project switching until a deleted dirty action is recovered or discarded', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'first' })
        actionService.loadFromFiles([{
            content: JSON.stringify(actionDefinition('run')),
            path: 'actions/run.json',
        }])
        actionService.updateDraft('actions/run.json', { ...actionDefinition('run'), label: '' })
        actionService.reloadFromFiles([], [{ origin: 'external', path: 'actions/run.json' }])

        await expect(service.projectLoading.openProject({ branch: 'main', id: 'second' }))
            .rejects.toThrow(/requires explicit recovery or discard/u)
        expect(service.getState().project?.id).toBe('first')

        actionService.discardDeletedDraft('actions/run.json')
        await service.projectLoading.openProject({ branch: 'main', id: 'second' })
        expect(service.getState().project?.id).toBe('second')
    })

    it('derives project states from active cards when config does not define them', async () => {
        configService.init()
        const rootFiles = [
            { ...files[0], content: files[0].content.replace('status: active', 'status: design') },
            { content: '---\nid: F-2\ntitle: Ready\nstatus: ready for implementation\n---\n', path: 'design/F-2-ready.md' },
        ]
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: rootFiles, workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: rootFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(service.getConfig()?.states).toEqual([
            { alwaysVisible: true, color: defaultColumnAccent(1), state: 'design' },
            { alwaysVisible: true, color: defaultColumnAccent(2), state: 'ready for implementation' },
            { alwaysVisible: true, color: defaultColumnAccent(0), state: 'new' },
            { alwaysVisible: true, color: defaultColumnAccent(3), state: 'in progress' },
            { alwaysVisible: true, color: defaultColumnAccent(4), state: 'done' },
        ])
    })

    it('uses default states when config and active cards have no states', async () => {
        configService.init()
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [], workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(service.getConfig()?.states).toEqual(DEFAULT_STATES)
    })

    it('assigns and saves a visible shade when opening a project without config', async () => {
        configService.init()
        const storage = createStorage({ loadProjectConfig: vi.fn(async () => null) })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(service.getConfig()?.backgroundShade).toMatch(/^(amber|blue|green|purple|red)$/u)
        expect(storage.saveProjectConfig).toHaveBeenCalledWith(
            { branch: 'main', id: 'project' },
            expect.objectContaining({ backgroundShade: expect.stringMatching(/^(amber|blue|green|purple|red)$/u) }),
        )
    })

    it('renames card files one at a time while publishing global progress', async () => {
        configService.init()
        const storage = createStorage({loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, cardSeparator: '-' as const, projectFolder: '', workingFolder: 'design' }))})
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const progressStates: Array<GlobalProgress | null> = []
        const handleProgress = (event: Event) => {
            progressStates.push((event as CustomEvent<GlobalProgress | null>).detail)
        }
        globalProgressService.addEventListener(GLOBAL_PROGRESS_EVENT, handleProgress)

        const renamedCount = await service.projectLoading.updateCardSeparator('-', '_')

        globalProgressService.removeEventListener(GLOBAL_PROGRESS_EVENT, handleProgress)
        expect(renamedCount).toBe(2)
        expect(storage.moveFiles).toHaveBeenCalledTimes(2)
        expect(storage.moveFiles).toHaveBeenNthCalledWith(1, expect.objectContaining({
            moves: [expect.objectContaining({
                content: expect.stringContaining('id: F_1'),
                fromPath: 'design/F-1-root.md',
                toPath: 'design/F_1_root.md',
            })],
        }))
        expect(storage.moveFiles).toHaveBeenNthCalledWith(2, expect.objectContaining({
            moves: [expect.objectContaining({
                fromPath: 'design/history/F-3-old.md',
                toPath: 'design/history/F_3_old.md',
            })],
        }))
        expect(progressStates).toContainEqual(expect.objectContaining({ completed: 1, total: 2 }))
        expect(progressStates.at(-1)).toBeNull()
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
    })

    it('keeps configured project states instead of deriving card states', async () => {
        configService.init()
        const configuredStates = [{ alwaysVisible: true, state: 'configured' }]
        const storage = createStorage({loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', states: configuredStates, workingFolder: 'design' }))})
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(service.getConfig()?.states).toEqual([
            { ...configuredStates[0], color: defaultColumnAccent(0) },
        ])
    })
    it('loads action files from the configured actions folder into the action service on open', async () => {
        configService.init()
        const actionFile = { content: JSON.stringify(actionDefinition('do')), path: 'actions/do.json' }
        const storage = createStorage({ loadActionFiles: vi.fn(async () => [actionFile]) })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(storage.loadActionFiles).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'actions')
        expect(actionService.getActions().map((action) => action.id)).toContain('action-do')
    })

    it('opens project with usable actions and reports collected action problems', async () => {
        configService.init()
        const warnings = recordDialogMessages('warning')
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => [
                { content: JSON.stringify({ ...actionDefinition('do'), name: 'Old name' }), path: 'actions/do.json' },
                { content: '{ invalid', path: 'actions/bad.json' },
                { content: JSON.stringify({ command: 'npm test' }), path: 'actions/defaulted.json' },
            ]),
        })
        const service = new DataService()
        service.init({ storage })

        const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(snapshot).not.toBeNull()
        expect(actionService.getActions().map(({ id }) => id)).toEqual(expect.arrayContaining(['action-do', 'action-actions-defaulted']))
        expect(warnings.messages.join('\n')).toContain('actions/bad.json')
        expect(warnings.messages.join('\n')).toContain('Missing id')
        warnings.stop()
    })

    it('uses defaults and keeps opening when project configuration and actions cannot be loaded', async () => {
        configService.init()
        const warnings = recordDialogMessages('warning')
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => {
                throw new Error('actions unavailable')
            }),
            loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'invalid' as never })),
            loadProjectRoot: vi.fn(async () => ({ files: [files[0]], workingFolder: 'design' })),
        })
        const service = new DataService()

        try {
            service.init({ storage })
            const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            expect(snapshot.activeCards.map(({ path }) => path)).toEqual(['design/F-1-root.md'])
            expect(actionService.getActions()).toEqual([])
            expect(warnings.messages.join('\n')).toContain('Project configuration could not be loaded')
            expect(warnings.messages.join('\n')).toContain('Actions could not be loaded')
        } finally {
            warnings.stop()
        }
    })

    it('skips a card that fails to parse while keeping other cards available', async () => {
        configService.init()
        const warnings = recordDialogMessages('warning')
        const invalidFile = { content: '# Invalid', path: 'design/F-2-invalid.md' }
        const originalParseCard = markdownParsingService.parseCard
        const parseCard = vi.spyOn(markdownParsingService, 'parseCard').mockImplementation((file, workingFolder) => {
            if (file.path === invalidFile.path) throw new Error('invalid test card')

            return originalParseCard(file, workingFolder)
        })
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [files[0], invalidFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [files[0], invalidFile], workingFolder: 'design' })),
        })
        const service = new DataService()

        try {
            service.init({ storage })
            const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            expect(snapshot.activeCards.map(({ path }) => path)).toEqual(['design/F-1-root.md'])
            expect(warnings.messages).toContain(`Some project files could not be loaded and were skipped: ${invalidFile.path}`)
        } finally {
            parseCard.mockRestore()
            warnings.stop()
        }
    })

    it('loads project files and actions from folders inside the configured project folder', async () => {
        configService.init()
        const projectFile = { ...files[0], path: 'projects/demo/design/F-1-root.md' }
        const projectNote = { content: '# Project note', path: 'projects/demo/notes/project-note.md' }
        const actionFile = {
            content: JSON.stringify(actionDefinition('do')),
            path: 'projects/demo/actions/do.json',
        }
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => [actionFile]),
            loadProject: vi.fn(async () => ({ files: [projectFile, projectNote], workingFolder: 'projects/demo' })),
            loadProjectConfig: vi.fn(async () => ({ actionsFolder: 'actions', backgroundShade: 'blue' as const, projectFolder: 'projects/demo', workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [projectFile], workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(storage.loadActionFiles).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'projects/demo/actions')
        expect(storage.loadProjectRoot).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'projects/demo/design')
        expect(storage.loadProject).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'projects/demo')
        expect(service.getState().snapshot?.workingFolder).toBe('projects/demo/design')
        expect(service.getState().snapshot?.activeCards.map((card) => card.path)).toEqual(['projects/demo/design/F-1-root.md'])
        await vi.waitFor(() => {
            expect(service.getState().snapshot?.backgroundCards.map((card) => card.path)).toEqual(['projects/demo/notes/project-note.md'])
        })
        expect(service.getConfig()?.actionsFolder).toBe('projects/demo/actions')
    })

    it('dispatches the root snapshot before loading background subfolder and history cards', async () => {
        configService.init()
        const rootFiles = [files[0]]
        const backgroundFile = files[1]
        const fullProject = createDeferred<StorageProjectFiles>()
        const snapshots: Array<ReturnType<DataService['getState']>['snapshot']> = []
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => ['design/F-1-root.md', 'design/history/F-3-old.md']),
            loadProject: vi.fn(async () => fullProject.promise),
            loadProjectRoot: vi.fn(async () => ({ files: rootFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })
        service.addEventListener('changed', () => {
            snapshots.push(service.getState().snapshot)
        })

        const openedSnapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(openedSnapshot.activeCards.map((card) => card.path)).toEqual(['design/F-1-root.md'])
        expect(openedSnapshot.backgroundCards).toHaveLength(0)
        expect(snapshots.filter((snapshot) => snapshot !== null)[0]?.backgroundCards).toHaveLength(0)
        expect(storage.loadProjectRoot).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'design')
        expect(storage.loadProject).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, '')

        fullProject.resolve({ files: [files[0], backgroundFile], workingFolder: 'design' })

        await vi.waitFor(() => {
            expect(service.getState().snapshot?.backgroundCards.map((card) => card.path)).toEqual(['design/history/F-3-old.md'])
        })
    })

    it('reports background project load failures while keeping the root snapshot available', async () => {
        configService.init()
        const error = new Error('network down')
        const errors = recordDialogMessages('error')
        const storage = createStorage({
            loadProject: vi.fn(async () => {
                throw error
            }),
            loadProjectRoot: vi.fn(async () => ({ files: [files[0]], workingFolder: 'design' })),
        })
        const service = new DataService()
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)

        try {
            service.init({ storage })
            const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            expect(snapshot.activeCards.map((card) => card.path)).toEqual(['design/F-1-root.md'])

            await vi.waitFor(() => {
                expect(errors.messages).toContain('Background project data failed to load - search and history may be incomplete. network down')
            })

            expect(captureError).toHaveBeenCalledWith(error)
            expect(service.getState().snapshot?.activeCards.map((card) => card.path)).toEqual(['design/F-1-root.md'])
        } finally {
            errors.stop()
            captureError.mockRestore()
        }
    })

    it('does not report failures from a superseded background project load', async () => {
        configService.init()
        const firstFullProject = createDeferred<StorageProjectFiles>()
        const errors = recordDialogMessages('error')
        const loadProject = vi.fn<StorageService['loadProject']>(async () => firstFullProject.promise)
        loadProject.mockImplementationOnce(async () => firstFullProject.promise)
        loadProject.mockImplementationOnce(async () => ({ files: [files[0]], workingFolder: 'design' }))
        const storage = createStorage({
            loadProject,
            loadProjectRoot: vi.fn(async () => ({ files: [files[0]], workingFolder: 'design' })),
        })
        const service = new DataService()
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })
            await service.projectLoading.openProject({ branch: 'main', id: 'other' })

            firstFullProject.reject(new Error('old load failed'))
            await waitForWorkerTurn()

            expect(errors.messages).toHaveLength(0)
            expect(captureError).not.toHaveBeenCalled()
        } finally {
            errors.stop()
            captureError.mockRestore()
        }
    })

    it('imports external root markdown files after the full project load', async () => {
        configService.init()
        const externalFile = { content: '# Notes\n\nBody', path: 'design/notes.md', sha: 'sha-notes' }
        const rootFiles = [files[0], externalFile]
        const fullFiles = [files[0], files[1], externalFile]
        const notices = recordDialogMessages('success')
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: fullFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: rootFiles, workingFolder: 'design' })),
        })
        const service = new DataService()

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            await vi.waitFor(() => {
                expect(storage.moveFiles).toHaveBeenCalledWith({
                    branch: 'main',
                    message: 'Import 1 external file',
                    moves: [expect.objectContaining({
                        fromPath: 'design/notes.md',
                        sha: 'sha-notes',
                        toPath: 'design/F-4-notes.md',
                    })],
                })
            })

            const importedCard = service.getState().snapshot?.activeCards.find((card) => card.path === 'design/F-4-notes.md')
            expect(importedCard?.header).toMatchObject({ id: 'F-4', status: 'active', title: 'Notes' })
            expect(importedCard?.header.internalId).toBeTruthy()
            expect(service.getState().snapshot?.activeCards.some((card) => card.path === 'design/notes.md')).toBe(false)
            expect(notices.messages).toContain('Imported 1 external file as new cards.')
            expect(trackEvent).toHaveBeenCalledWith('external_file_import')
        } finally {
            notices.stop()
            trackEvent.mockRestore()
        }
    })

    it('does not repeat imports for complete conforming cards', async () => {
        configService.init()
        const completeFile = {
            content: '---\nid: F-4\ninternalId: uuid-4\ntitle: Imported\nstatus: new\n---\n\n# Imported',
            path: 'design/F-4-imported.md',
        }
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [...storageFiles, completeFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [files[0], completeFile], workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await waitForWorkerTurn()

        expect(storage.moveFiles).not.toHaveBeenCalled()
    })

    it('reports import failures and keeps source files loaded unchanged', async () => {
        configService.init()
        const externalFile = { content: '# Notes\n\nBody', path: 'design/notes.md', sha: 'sha-notes' }
        const errors = recordDialogMessages('error')
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [...storageFiles, externalFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [files[0], externalFile], workingFolder: 'design' })),
            moveFiles: vi.fn(async () => {
                throw new Error('commit failed')
            }),
        })
        const service = new DataService()

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            await vi.waitFor(() => {
                expect(errors.messages).toContain('commit failed')
            })

            expect(service.getState().snapshot?.activeCards.some((card) => card.path === 'design/notes.md')).toBe(true)
            expect(service.getState().snapshot?.activeCards.some((card) => card.path === 'design/F-4-notes.md')).toBe(false)
            expect(storage.push).not.toHaveBeenCalled()
        } finally {
            errors.stop()
        }
    })

    it('reloads actions when the local actions folder watcher reports json changes', async () => {
        vi.useFakeTimers()
        configService.init()
        const actionFile = { content: JSON.stringify(actionDefinition('do')), path: 'actions/do.json' }
        const loadActionFiles = vi.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([actionFile])
            .mockResolvedValueOnce([])
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadActionFiles,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        watchChange({ changeKind: 'changed', path: 'actions/do.json' })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getActions().map((action) => action.id)).toContain('action-do')

        watchChange({ changeKind: 'changed', path: 'actions/do.json' })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getActions().map((action) => action.id)).not.toContain('action-do')
    })

    it('marks an action watcher event during its commit as a local publication echo', async () => {
        vi.useFakeTimers()
        configService.init()
        configService.set('react.autoCommitDelayMs', 1000)
        const initialFile = { content: JSON.stringify(actionDefinition('do')), path: 'actions/do.json' }
        const commit = createDeferred<StorageProjectFiles['files']>()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            commit: vi.fn(() => commit.promise),
            loadActionFiles: vi.fn(async () => [initialFile]),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        actionService.updateDraft(initialFile.path, { ...actionDefinition('do'), label: 'Local edit' })
        await vi.advanceTimersByTimeAsync(1000)
        expect(storage.commit).toHaveBeenCalledOnce()

        watchChange({ changeKind: 'changed', path: initialFile.path })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getDefinitionByPath(initialFile.path)?.label).toBe('Local edit')
        expect(actionService.getDraft(initialFile.path).conflict).toBeNull()
        commit.resolve([])
        await vi.advanceTimersByTimeAsync(0)
    })

    it('surfaces action reload validation errors while loading other usable actions', async () => {
        vi.useFakeTimers()
        configService.init()
        const validActionFile = { content: JSON.stringify(actionDefinition('do')), path: 'actions/do.json' }
        const invalidActionFile = { content: JSON.stringify(actionDefinition('bad', { type: 'bad' })), path: 'actions/bad.json' }
        const replacementActionFile = { content: JSON.stringify(actionDefinition('replacement')), path: 'actions/replacement.json' }
        const loadActionFiles = vi.fn()
            .mockResolvedValueOnce([validActionFile])
            .mockResolvedValueOnce([invalidActionFile, replacementActionFile])
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadActionFiles,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        watchChange({ changeKind: 'changed', path: 'actions/bad.json' })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getActions().map((action) => action.id)).toContain('action-replacement')
        expect(actionService.getActions().map((action) => action.id)).not.toContain('action-do')
        expect(actionService.getState().error).toContain('actions/bad.json')
        expect(actionService.getState().error).toContain('Invalid action type')
    })

    it('loads usable actions from a batch and reports only invalid files', async () => {
        vi.useFakeTimers()
        configService.init()
        const validActionFile = { content: JSON.stringify(actionDefinition('do')), path: 'actions/do.json' }
        const invalidFirstActionFile = { content: JSON.stringify(actionDefinition('bad', { type: 'bad' })), path: 'actions/bad.json' }
        const changedSecondActionFile = { content: JSON.stringify(actionDefinition('more')), path: 'actions/more.json' }
        const loadActionFiles = vi.fn()
            .mockResolvedValueOnce([validActionFile])
            .mockResolvedValueOnce([invalidFirstActionFile, changedSecondActionFile])
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadActionFiles,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        watchChange({ changeKind: 'changed', path: 'actions/bad.json' })
        watchChange({ changeKind: 'changed', path: 'actions/more.json' })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getActions().map((action) => action.id)).toContain('action-more')
        expect(actionService.getActions().map((action) => action.id)).not.toContain('action-do')
        expect(actionService.getState().error).toContain('actions/bad.json')
        expect(actionService.getState().error).not.toContain('actions/more.json')
        expect(actionService.getState().error).toContain('Invalid action type')
    })

    it('imports a new external markdown file when the watcher reports it', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => ({ content: '# New external note', path: 'design/free-note.md' })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'added', path: 'design/free-note.md' })
        await vi.advanceTimersByTimeAsync(150)

        expect(storage.moveFiles).toHaveBeenCalledWith({
            branch: 'main',
            message: 'Import 1 external file',
            moves: [expect.objectContaining({
                fromPath: 'design/free-note.md',
                toPath: 'design/F-4-new-external-note.md',
            })],
        })
        const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/F-4-new-external-note.md')
        expect(card?.header.status).toBe('active')
        expect(card?.header.internalId).toBeTruthy()
    })

    it('updates markdown content when the watcher reports an external edit', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => ({
                content: '---\nid: F-1\ntitle: Root\nstatus: active\n---\n\n# Root\n\nExternally changed',
                path: 'design/F-1-root.md',
            })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(150)

        const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/F-1-root.md')
        expect(card?.content).toContain('Externally changed')
    })

    it('removes a markdown card when the watcher reports deletion', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'removed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(150)

        expect(service.getState().snapshot?.activeCards.some((card) => card.path === 'design/F-1-root.md')).toBe(false)
        expect(storage.loadFile).not.toHaveBeenCalled()
    })

    it('debounces repeated markdown watcher events for the same file', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const loadFile = vi.fn(async () => ({
            content: '---\nid: F-1\ntitle: Root\nstatus: active\n---\n\n# Root\n\nLatest',
            path: 'design/F-1-root.md',
        }))
        const storage = createStorage({
            loadFile,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(149)
        expect(loadFile).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)

        expect(loadFile).toHaveBeenCalledTimes(1)
    })

    it('ignores self-echo markdown watcher events when content matches memory', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => files[0]),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(150)

        const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/F-1-root.md')
        expect(card?.content).toContain('# Root')
    })

    it('reports a conflict and keeps local markdown content when unsaved edits exist', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => ({
                content: '---\nid: F-1\ntitle: Root\nstatus: active\n---\n\n# Root\n\nExternal',
                path: 'design/F-1-root.md',
            })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })
        const conflicts = recordDialogMessages('error')
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        try {
            service.cards.updateCardBody('design/F-1-root.md', '# Root\n\nLocal draft')
            watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
            await vi.advanceTimersByTimeAsync(150)

            expect(conflicts.messages[0]).toContain('External change ignored for design/F-1-root.md')
            const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/F-1-root.md')
            expect(card?.content).toContain('Local draft')
        } finally {
            conflicts.stop()
        }
    })
})

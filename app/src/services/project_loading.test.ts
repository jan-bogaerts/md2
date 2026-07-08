import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StorageProjectFiles, StorageService } from '../data/data_types'
import { actionService } from './action_service'
import { configService } from './config_service'
import { DataService } from './data_service'
import { telemetryService } from './telemetry_service'
import { createDeferred, createStorage, files, storageFiles, waitForWorkerTurn } from './test_support/data_service_test_support'

describe('ProjectLoading', () => {
    afterEach(() => {
        vi.useRealTimers()
        delete window.md2Actions
        configService.clear()
    })
    it('loads action files from the configured actions folder into the action service on open', async () => {
        configService.init()
        const actionFile = { content: JSON.stringify({ description: 'Do', label: 'Do', name: 'do', text: 'run', type: 'cmd' }), path: 'actions/do.json' }
        const storage = createStorage({ loadActionFiles: vi.fn(async () => [actionFile]) })
        const service = new DataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        expect(storage.loadActionFiles).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'actions')
        expect(actionService.getActions().map((action) => action.name)).toContain('do')
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
        expect(storage.loadProject).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'design')

        fullProject.resolve({ files: [files[0], backgroundFile], workingFolder: 'design' })

        await vi.waitFor(() => {
            expect(service.getState().snapshot?.backgroundCards.map((card) => card.path)).toEqual(['design/history/F-3-old.md'])
        })
    })

    it('reports background project load failures while keeping the root snapshot available', async () => {
        configService.init()
        const error = new Error('network down')
        const errors: string[] = []
        const handleWorkspaceError = (event: Event) => {
            errors.push((event as CustomEvent<string>).detail)
        }
        const storage = createStorage({
            loadProject: vi.fn(async () => {
                throw error
            }),
            loadProjectRoot: vi.fn(async () => ({ files: [files[0]], workingFolder: 'design' })),
        })
        const service = new DataService()
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)
        window.addEventListener('md2:workspace-error', handleWorkspaceError)

        try {
            service.init({ storage })
            const snapshot = await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            expect(snapshot.activeCards.map((card) => card.path)).toEqual(['design/F-1-root.md'])

            await vi.waitFor(() => {
                expect(errors).toContain('Background project data failed to load - search and history may be incomplete. network down')
            })

            expect(captureError).toHaveBeenCalledWith(error)
            expect(service.getState().snapshot?.activeCards.map((card) => card.path)).toEqual(['design/F-1-root.md'])
        } finally {
            window.removeEventListener('md2:workspace-error', handleWorkspaceError)
            captureError.mockRestore()
        }
    })

    it('does not report failures from a superseded background project load', async () => {
        configService.init()
        const firstFullProject = createDeferred<StorageProjectFiles>()
        const errors: string[] = []
        const handleWorkspaceError = (event: Event) => {
            errors.push((event as CustomEvent<string>).detail)
        }
        const loadProject = vi.fn<StorageService['loadProject']>(async () => firstFullProject.promise)
        loadProject.mockImplementationOnce(async () => firstFullProject.promise)
        loadProject.mockImplementationOnce(async () => ({ files: [files[0]], workingFolder: 'design' }))
        const storage = createStorage({
            loadProject,
            loadProjectRoot: vi.fn(async () => ({ files: [files[0]], workingFolder: 'design' })),
        })
        const service = new DataService()
        const captureError = vi.spyOn(telemetryService, 'captureError').mockImplementation(() => undefined)
        window.addEventListener('md2:workspace-error', handleWorkspaceError)

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })
            await service.projectLoading.openProject({ branch: 'main', id: 'other' })

            firstFullProject.reject(new Error('old load failed'))
            await waitForWorkerTurn()

            expect(errors).toHaveLength(0)
            expect(captureError).not.toHaveBeenCalled()
        } finally {
            window.removeEventListener('md2:workspace-error', handleWorkspaceError)
            captureError.mockRestore()
        }
    })

    it('imports external root markdown files after the full project load', async () => {
        configService.init()
        const externalFile = { content: '# Notes\n\nBody', path: 'design/notes.md', sha: 'sha-notes' }
        const rootFiles = [files[0], externalFile]
        const fullFiles = [files[0], files[1], externalFile]
        const notices: string[] = []
        const handleNotice = (event: Event) => {
            notices.push((event as CustomEvent<string>).detail)
        }
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: fullFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: rootFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        window.addEventListener('md2:workspace-notice', handleNotice)

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
            expect(importedCard?.header).toMatchObject({ id: 'F-4', status: 'new', title: 'Notes' })
            expect(importedCard?.header.internalId).toBeTruthy()
            expect(service.getState().snapshot?.activeCards.some((card) => card.path === 'design/notes.md')).toBe(false)
            expect(notices).toContain('Imported 1 external file as new cards.')
            expect(trackEvent).toHaveBeenCalledWith('external_file_import')
        } finally {
            window.removeEventListener('md2:workspace-notice', handleNotice)
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
        const errors: string[] = []
        const handleWorkspaceError = (event: Event) => {
            errors.push((event as CustomEvent<string>).detail)
        }
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [...storageFiles, externalFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [files[0], externalFile], workingFolder: 'design' })),
            moveFiles: vi.fn(async () => {
                throw new Error('commit failed')
            }),
        })
        const service = new DataService()
        window.addEventListener('md2:workspace-error', handleWorkspaceError)

        try {
            service.init({ storage })
            await service.projectLoading.openProject({ branch: 'main', id: 'project' })

            await vi.waitFor(() => {
                expect(errors).toContain('commit failed')
            })

            expect(service.getState().snapshot?.activeCards.some((card) => card.path === 'design/notes.md')).toBe(true)
            expect(service.getState().snapshot?.activeCards.some((card) => card.path === 'design/F-4-notes.md')).toBe(false)
            expect(storage.push).not.toHaveBeenCalled()
        } finally {
            window.removeEventListener('md2:workspace-error', handleWorkspaceError)
        }
    })

    it('reloads actions when the local actions folder watcher reports json changes', async () => {
        vi.useFakeTimers()
        configService.init()
        const actionFile = { content: JSON.stringify({ description: 'Do', label: 'Do', name: 'do', text: 'run', type: 'cmd' }), path: 'actions/do.json' }
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

        expect(actionService.getActions().map((action) => action.name)).toContain('do')

        watchChange({ changeKind: 'changed', path: 'actions/do.json' })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getActions().map((action) => action.name)).not.toContain('do')
    })

    it('surfaces action reload validation errors without dropping the previous valid actions', async () => {
        vi.useFakeTimers()
        configService.init()
        const validActionFile = { content: JSON.stringify({ description: 'Do', label: 'Do', name: 'do', text: 'run', type: 'cmd' }), path: 'actions/do.json' }
        const invalidActionFile = { content: JSON.stringify({ description: 'Bad', label: 'Bad', name: 'bad', text: 'run', type: 'bad' }), path: 'actions/bad.json' }
        const loadActionFiles = vi.fn()
            .mockResolvedValueOnce([validActionFile])
            .mockResolvedValueOnce([invalidActionFile])
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

        expect(actionService.getActions().map((action) => action.name)).toContain('do')
        expect(actionService.getState().error).toContain('actions/bad.json')
        expect(actionService.getState().error).toContain('Invalid action type')
    })

    it('reports all changed action paths when batched watcher events fail validation', async () => {
        vi.useFakeTimers()
        configService.init()
        const validActionFile = { content: JSON.stringify({ description: 'Do', label: 'Do', name: 'do', text: 'run', type: 'cmd' }), path: 'actions/do.json' }
        const invalidFirstActionFile = { content: JSON.stringify({ description: 'Bad', label: 'Bad', name: 'bad', text: 'run', type: 'bad' }), path: 'actions/bad.json' }
        const changedSecondActionFile = { content: JSON.stringify({ description: 'More', label: 'More', name: 'more', text: 'run', type: 'cmd' }), path: 'actions/more.json' }
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

        expect(actionService.getActions().map((action) => action.name)).toContain('do')
        expect(actionService.getState().error).toContain('actions/bad.json')
        expect(actionService.getState().error).toContain('actions/more.json')
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
        expect(card?.header.status).toBe('new')
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
        const conflicts: string[] = []
        window.addEventListener('md2:workspace-error', (event) => {
            conflicts.push((event as CustomEvent<string>).detail)
        })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        service.cards.updateCardBody('design/F-1-root.md', '# Root\n\nLocal draft')
        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(150)

        expect(conflicts[0]).toContain('External change ignored for design/F-1-root.md')
        const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/F-1-root.md')
        expect(card?.content).toContain('Local draft')
    })
})

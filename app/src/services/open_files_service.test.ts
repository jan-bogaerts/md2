import { describe, expect, it, vi } from 'vitest'
import { getService } from './service_injector'
import { OpenFilesService, type OpenFileEventDetail } from './open_files_service'

describe('OpenFilesService', () => {
    it('tracks files of any type and emits an added event for each new path', () => {
        const service = new OpenFilesService()
        const listener = vi.fn()
        service.addEventListener('added', listener)

        service.openFile('design/F-1-card.md')
        service.openFile('actions/review.json')
        service.openFile('notes/readme.md')

        expect(service.getSnapshot()).toEqual({
            activePath: 'notes/readme.md',
            paths: ['design/F-1-card.md', 'actions/review.json', 'notes/readme.md'],
        })
        expect(listener).toHaveBeenCalledTimes(3)
        const event = listener.mock.calls[1][0] as CustomEvent<OpenFileEventDetail>
        expect(event.detail.path).toBe('actions/review.json')
    })

    it('activates an existing file without emitting another added event', () => {
        const service = new OpenFilesService()
        const listener = vi.fn()
        service.addEventListener('added', listener)
        service.openFile('a.md')
        service.openFile('b.md')

        service.openFile('a.md')

        expect(service.getSnapshot()).toEqual({ activePath: 'a.md', paths: ['a.md', 'b.md'] })
        expect(listener).toHaveBeenCalledTimes(2)
    })

    it('focuses a neighbouring file and emits removed when a file is closed', () => {
        const service = new OpenFilesService()
        const listener = vi.fn()
        service.addEventListener('removed', listener)
        service.openFile('a.md')
        service.openFile('b.md')
        service.openFile('c.md')
        service.activateFile('b.md')

        service.closeFile('b.md')

        expect(service.getSnapshot()).toEqual({ activePath: 'c.md', paths: ['a.md', 'c.md'] })
        expect(listener).toHaveBeenCalledOnce()
        const event = listener.mock.calls[0][0] as CustomEvent<OpenFileEventDetail>
        expect(event.detail.path).toBe('b.md')
    })

    it('replaces an open path without changing its position or active state', () => {
        const service = new OpenFilesService()
        service.openFile('a.md')
        service.openFile('actions/new-action.json')
        service.openFile('c.md')
        service.activateFile('actions/new-action.json')

        service.replaceFilePath('actions/new-action.json', 'actions/review-code.json')

        expect(service.getSnapshot()).toEqual({
            activePath: 'actions/review-code.json',
            paths: ['a.md', 'actions/review-code.json', 'c.md'],
        })
    })

    it('removes unavailable files and emits a removed event for each one', () => {
        const service = new OpenFilesService()
        const listener = vi.fn()
        service.addEventListener('removed', listener)
        service.openFile('a.md')
        service.openFile('b.md')
        service.openFile('c.md')

        service.retainAvailableFiles(['b.md'])

        expect(service.getSnapshot()).toEqual({ activePath: 'b.md', paths: ['b.md'] })
        expect(listener).toHaveBeenCalledTimes(2)
    })

    it('clears open files when the project changes', () => {
        const service = new OpenFilesService()
        const listener = vi.fn()
        service.syncProject('one:main')
        service.openFile('a.md')
        service.addEventListener('removed', listener)

        service.syncProject('two:main')

        expect(service.getSnapshot()).toEqual({ activePath: null, paths: [] })
        expect(listener).toHaveBeenCalledOnce()
    })

    it('fails fast when a file operation has no path', () => {
        const service = new OpenFilesService()

        expect(() => service.openFile('')).toThrow('Cannot track an open file without a path')
        expect(() => service.activateFile('')).toThrow('Cannot track an open file without a path')
        expect(() => service.closeFile('')).toThrow('Cannot track an open file without a path')
    })

    it('registers itself in the service injector', () => {
        expect(getService('openFilesService')).toBeInstanceOf(OpenFilesService)
    })
})

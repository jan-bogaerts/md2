import { describe, expect, it } from 'vitest'
import { GLOBAL_PROGRESS_EVENT, GlobalProgressService } from './global_progress_service'

describe('GlobalProgressService', () => {
    it('publishes start, update, and finish states', () => {
        const service = new GlobalProgressService()
        const states: unknown[] = []
        service.addEventListener(GLOBAL_PROGRESS_EVENT, (event) => {
            states.push((event as CustomEvent).detail)
        })

        service.start('Renaming files', 2)
        service.update(1, 'Renamed first file')
        service.finish()

        expect(states).toEqual([
            { completed: 0, info: 'Renaming files', total: 2 },
            { completed: 1, info: 'Renamed first file', total: 2 },
            null,
        ])
        expect(service.getProgress()).toBeNull()
    })

    it('rejects invalid totals and updates outside the active range', () => {
        const service = new GlobalProgressService()

        expect(() => service.start('Renaming files', 0)).toThrow('positive integer')
        expect(() => service.update(1)).toThrow('has not started')

        service.start('Renaming files', 2)

        expect(() => service.update(3)).toThrow('between 0 and 2')
    })
})

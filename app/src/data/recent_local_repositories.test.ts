import { afterEach, describe, expect, it } from 'vitest'
import {
    MAX_RECENT_LOCAL_REPOSITORIES,
    readRecentLocalRepositories,
    RECENT_LOCAL_REPOSITORIES_STORAGE_KEY,
    recordRecentLocalRepository,
} from './recent_local_repositories'

describe('recent local repositories', () => {
    afterEach(() => window.localStorage.removeItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY))

    it('discards invalid stored data', () => {
        window.localStorage.setItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY, JSON.stringify(['C:/repo', 4]))

        expect(readRecentLocalRepositories()).toEqual([])
        expect(window.localStorage.getItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY)).toBeNull()
    })

    it('keeps five unique canonical roots newest first', () => {
        for (let index = 1; index <= 6; index += 1) recordRecentLocalRepository(`C:/repo-${index}`)

        expect(readRecentLocalRepositories()).toEqual([
            'C:/repo-6',
            'C:/repo-5',
            'C:/repo-4',
            'C:/repo-3',
            'C:/repo-2',
        ])
        expect(readRecentLocalRepositories()).toHaveLength(MAX_RECENT_LOCAL_REPOSITORIES)
    })

    it('moves a case-insensitive Windows path match to the front', () => {
        recordRecentLocalRepository('C:/First')
        recordRecentLocalRepository('C:/Second')

        expect(recordRecentLocalRepository('c:/first')).toEqual(['c:/first', 'C:/Second'])
    })
})

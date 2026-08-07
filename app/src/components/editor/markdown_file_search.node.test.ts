import { describe, expect, it } from 'vitest'
import {
    repositoryFileMatchesQuery,
    repositoryFileName,
} from './markdown_file_search'
import { createFileSearchOptions } from './markdown_file_search_options'
import { matchFileSearchTrigger, matchFileSearchTriggerForFiles } from './markdown_file_search_trigger'

describe('matchFileSearchTrigger', () => {
    it('opens at the start of text and after a boundary', () => {
        expect(matchFileSearchTrigger('@', {} as never)).toEqual({
            leadOffset: 0,
            matchingString: '',
            replaceableString: '@',
        })
        expect(matchFileSearchTrigger('See (@design/F_1', {} as never)).toEqual({
            leadOffset: 5,
            matchingString: 'design/F_1',
            replaceableString: '@design/F_1',
        })
    })

    it('does not open inside words, email addresses, or after whitespace in the query', () => {
        expect(matchFileSearchTrigger('prefix@file', {} as never)).toBeNull()
        expect(matchFileSearchTrigger('person@example.com', {} as never)).toBeNull()
        expect(matchFileSearchTrigger('@design/file name', {} as never)).toBeNull()
    })

    it('does not open without project files', () => {
        expect(matchFileSearchTriggerForFiles('@', [])).toBeNull()
        expect(matchFileSearchTriggerForFiles('@missing', ['design/F_108.md'])).not.toBeNull()
        expect(matchFileSearchTriggerForFiles('@f_108', ['design/F_108.md'])).not.toBeNull()
    })
})

describe('repository file search', () => {
    it('filters complete paths case-insensitively', () => {
        expect(repositoryFileMatchesQuery('Design/Feature/F_108.md', 'feature/f_108')).toBe(true)
        expect(repositoryFileMatchesQuery('Design/Feature/F_108.md', 'missing')).toBe(false)
    })

    it('builds no options while search is inactive', () => {
        const repositoryFiles = ['design/F_108.md', 'app/main.tsx']

        expect(createFileSearchOptions(repositoryFiles, null)).toEqual([])
        expect(createFileSearchOptions(repositoryFiles, 'f_108').map(({ repositoryPath }) => repositoryPath))
            .toEqual(['design/F_108.md'])
    })

    it('keeps duplicate filenames distinguishable by their repository paths', () => {
        const repositoryPaths = ['app/readme.md', 'desktop/readme.md']

        expect(repositoryPaths.map(repositoryFileName)).toEqual(['readme.md', 'readme.md'])
        expect(repositoryPaths).toEqual(['app/readme.md', 'desktop/readme.md'])
    })
})

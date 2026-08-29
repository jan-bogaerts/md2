import { describe, expect, it } from 'vitest'
import { toProjectFolderRelativePath, toRepositoryRelativePath } from './repository_relative_path'

describe('repository-relative folder paths', () => {
    it('converts a Windows folder inside the repository', () => {
        expect(toRepositoryRelativePath('C:\\repo', 'C:\\repo\\design\\active')).toBe('design/active')
    })

    it('rejects a sibling whose path only shares the repository prefix', () => {
        expect(toRepositoryRelativePath('C:\\repo', 'C:\\repository-copy\\design')).toBeNull()
    })

    it('converts a repository path into a project-folder-relative value', () => {
        expect(toProjectFolderRelativePath('design', 'design/feature_descriptions')).toBe('feature_descriptions')
    })

    it('rejects a folder outside the configured project folder', () => {
        expect(toProjectFolderRelativePath('design', 'docs/active')).toBeNull()
    })
})

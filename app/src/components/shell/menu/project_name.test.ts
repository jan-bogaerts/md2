import { describe, expect, it } from 'vitest'
import type { ProjectReference } from '../../../data/data_types'
import { projectName } from './project_name'

describe('projectName', () => {
    it.each([
        ['C:\\work\\md2_workers\\', 'md2_workers'],
        ['/work/md2_workers/', 'md2_workers'],
        ['C:/work\\md2_workers', 'md2_workers'],
    ])('uses the final folder segment from %s', (rootPath, expectedName) => {
        expect(projectName({ branch: 'main', id: 'full-project-id', rootPath })).toBe(expectedName)
    })

    it('uses the repository for a GitHub project', () => {
        const project: ProjectReference = {
            branch: 'main',
            id: 'owner/full-project-id',
            owner: 'owner',
            repository: 'md2_workers',
        }

        expect(projectName(project)).toBe('md2_workers')
    })

    it('fails clearly when a local or remote project has no rootPath', () => {
        expect(() => projectName({ branch: 'main', id: 'full-project-id' }))
            .toThrow('Cannot derive local or remote project name without rootPath')
    })

    it('fails clearly when a GitHub project has no repository', () => {
        expect(() => projectName({ branch: 'main', id: 'owner/full-project-id', owner: 'owner' }))
            .toThrow('Cannot derive GitHub project name without repository')
    })
})

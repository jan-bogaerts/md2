import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { loadProject } = require('./local_git_service')

describe('local-git-service', () => {
    it('loads markdown files from the working folder and subfolders', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'))

        try {
            await mkdir(join(rootPath, '.git'))
            await mkdir(join(rootPath, 'design', 'history'), { recursive: true })
            await writeFile(join(rootPath, 'design', 'F-1-root.md'), '# Root')
            await writeFile(join(rootPath, 'design', 'history', 'F-2-old.md'), '# Old')

            const projectFiles = await loadProject({ branch: 'main', id: 'local', rootPath }, 'design')

            expect(projectFiles.files.map((file) => file.path).sort()).toEqual(['design/F-1-root.md', 'design/history/F-2-old.md'])
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('creates template content when the working folder is missing', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'))

        try {
            await mkdir(join(rootPath, '.git'))

            await loadProject({ branch: 'main', id: 'local', rootPath }, 'design')

            await expect(readFile(join(rootPath, 'design', 'README.md'), 'utf8')).resolves.toContain('Project design folder')
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })
})

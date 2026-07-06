import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

const require = createRequire(import.meta.url)
const {
    appendActionRunHistory,
    commit,
    loadActionFiles,
    loadActionRunHistory,
    loadProject,
    loadProjectConfig,
    runAgent,
    runCommand,
    watchProject,
} = require('./local_git_service')

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

    it('loads json action files from the actions folder', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'))

        try {
            await mkdir(join(rootPath, '.git'))
            await mkdir(join(rootPath, 'actions'))
            await writeFile(join(rootPath, 'actions', 'implement.json'), '{"name":"implement"}')
            await writeFile(join(rootPath, 'actions', 'notes.md'), '# skip me')

            const files = await loadActionFiles({ branch: 'main', id: 'local', rootPath }, 'actions')

            expect(files).toEqual([{ content: '{"name":"implement"}', path: 'actions/implement.json' }])
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('returns no action files when the actions folder is missing', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'))

        try {
            await mkdir(join(rootPath, '.git'))

            await expect(loadActionFiles({ branch: 'main', id: 'local', rootPath }, 'actions')).resolves.toEqual([])
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('loads project config from the repository root', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'))

        try {
            await mkdir(join(rootPath, '.git'))
            await writeFile(join(rootPath, 'md2.config.json'), JSON.stringify({ pushMode: 'manual', workingFolder: 'docs' }))

            await expect(loadProjectConfig({ branch: 'main', id: 'local', rootPath })).resolves.toEqual({
                pushMode: 'manual',
                workingFolder: 'docs',
            })
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('runs commands from the project root and captures output', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'))

        try {
            await mkdir(join(rootPath, '.git'))

            const result = await runCommand(
                { branch: 'main', id: 'local', rootPath },
                'node -e "process.stdout.write(process.cwd())"',
            )

            expect(result.exitCode).toBe(0)
            expect(result.stdout).toBe(rootPath)
            expect(result.stderr).toBe('')
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('returns failed command output without throwing', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'))

        try {
            await mkdir(join(rootPath, '.git'))

            const result = await runCommand(
                { branch: 'main', id: 'local', rootPath },
                'node -e "process.stderr.write(\'bad\'); process.exit(7)"',
            )

            expect(result.exitCode).toBe(7)
            expect(result.stderr).toBe('bad')
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('runs an agent command from the project root with prompt input', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'))

        try {
            await mkdir(join(rootPath, '.git'))

            const result = await runAgent(
                { branch: 'main', id: 'local', rootPath },
                { command: 'node -e "process.stdin.on(\'data\', data => process.stdout.write(data))"', prompt: 'hello agent' },
            )

            expect(result.exitCode).toBe(0)
            expect(result.prompt).toBe('hello agent')
            expect(result.stdout).toBe('hello agent')
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('persists and loads action run history for the same action and context', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'))
        const request = {
            actionName: 'implement',
            actionsFolder: 'actions',
            context: { file: 'design/F-010.md', kind: 'card', type: 'feature' },
        }
        const entry = { completedAt: '2026-07-05T10:00:00.000Z', output: 'done', prompt: 'run', status: 'completed' }

        try {
            await mkdir(join(rootPath, '.git'))
            await mkdir(join(rootPath, 'actions'))

            await appendActionRunHistory({ branch: 'main', id: 'local', rootPath }, request, entry)

            await expect(loadActionRunHistory({ branch: 'main', id: 'local', rootPath }, request)).resolves.toEqual([entry])
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('writes base64-encoded files as binary and commits them alongside text files', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'))

        try {
            await execFileAsync('git', ['init'], { cwd: rootPath })
            await mkdir(join(rootPath, 'design'))

            await commit({
                files: [
                    { content: '# Card', path: 'design/F-1-card.md' },
                    { content: Buffer.from('binary-bytes').toString('base64'), encoding: 'base64', path: 'design/note.png' },
                ],
                message: 'Import Remarkable asset',
            }, { branch: 'main', id: 'local', rootPath })

            const written = await readFile(join(rootPath, 'design', 'note.png'))
            expect(written.toString()).toBe('binary-bytes')
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('reports json file changes for action hot-reload', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-local-git-'))
        let closeWatcher = null

        try {
            await mkdir(join(rootPath, '.git'))
            await mkdir(join(rootPath, 'actions'))
            const event = new Promise((resolve) => {
                closeWatcher = watchProject({ branch: 'main', id: 'local', rootPath }, resolve)
            })

            await writeFile(join(rootPath, 'actions', 'implement.json'), '{"name":"implement"}')

            await expect(event).resolves.toEqual({ path: 'actions/implement.json' })
        } finally {
            if (closeWatcher) closeWatcher()
            await rm(rootPath, { force: true, recursive: true })
        }
    })
})

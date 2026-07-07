import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
    ensureInsideRoot,
    requireRootPath,
    runCommand,
} = require('./git_commands')

describe('git-commands', () => {
    it('requires a project root path', () => {
        expect(() => requireRootPath({ id: 'local' })).toThrow('Missing local Git project rootPath')
    })

    it('rejects paths that escape the root', () => {
        expect(() => ensureInsideRoot('C:\\repo', 'C:\\outside\\file.md')).toThrow('Local Git path escapes project root')
    })

    it('runs commands from the project root and captures output', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-git-commands-'))

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
})

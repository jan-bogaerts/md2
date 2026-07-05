import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { buildEditorLaunch, generateDiff, openInEditor, parseUnifiedDiff, resolveDiffCommand } = require('./diff_service')

const SAMPLE_DIFF = [
    'diff --git a/design/F-010.md b/design/F-010.md',
    'index 1111111..2222222 100644',
    '--- a/design/F-010.md',
    '+++ b/design/F-010.md',
    '@@ -10,3 +10,4 @@ context header',
    ' unchanged line',
    '-old line',
    '+new line one',
    '+new line two',
    ' trailing line',
].join('\n')

describe('diff-service', () => {
    it('parses unified diff into per-file sides with real line numbers', () => {
        const files = parseUnifiedDiff(SAMPLE_DIFF)

        expect(files).toHaveLength(1)
        const [file] = files
        expect(file.path).toBe('design/F-010.md')
        expect(file.oldValue).toBe('unchanged line\nold line\ntrailing line')
        expect(file.newValue).toBe('unchanged line\nnew line one\nnew line two\ntrailing line')
        expect(file.oldLineNumbers).toEqual([10, 11, 12])
        expect(file.newLineNumbers).toEqual([10, 11, 12, 13])
    })

    it('rejects empty diff output', () => {
        expect(() => parseUnifiedDiff('   ')).toThrow('produced no output')
    })

    it('rejects output that has no diff headers', () => {
        expect(() => parseUnifiedDiff('not a diff at all')).toThrow('could not be parsed')
    })

    it('resolves diff command placeholders', () => {
        const command = resolveDiffCommand('git show {{commit}} -- {{file}}', { commit: 'abc1234', file: 'design/F-010.md' })

        expect(command).toBe('git show abc1234 -- design/F-010.md')
    })

    it('fails fast when a diff placeholder value is missing', () => {
        expect(() => resolveDiffCommand('git show {{commit}}', { commit: '' })).toThrow('Missing diff command value: commit')
    })

    it('generates normalized diff data through the runner', async () => {
        const runner = vi.fn(async () => ({ stdout: SAMPLE_DIFF }))
        const result = await generateDiff(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            { branch: 'main', commit: 'abc1234', filePath: '', template: 'git show {{commit}}' },
            runner,
        )

        expect(runner).toHaveBeenCalledWith('git show abc1234', expect.objectContaining({ cwd: 'C:/repo' }))
        expect(result.commit).toBe('abc1234')
        expect(result.files).toHaveLength(1)
    })

    it('reports diff command failures clearly', async () => {
        const runner = vi.fn(async () => {
            throw Object.assign(new Error('exit 1'), { stderr: 'fatal: bad object' })
        })

        await expect(generateDiff(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            { branch: 'main', commit: 'abc1234', filePath: '', template: 'git show {{commit}}' },
            runner,
        )).rejects.toThrow('Diff command failed: fatal: bad object')
    })

    it('fails fast when the commit hash is missing', async () => {
        await expect(generateDiff(
            { branch: 'main', id: 'local', rootPath: 'C:/repo' },
            { branch: 'main', commit: '', filePath: '', template: 'git show {{commit}}' },
            vi.fn(),
        )).rejects.toThrow('Missing diff commit hash')
    })

    it('builds a validated code launch command for an in-root file', () => {
        const command = buildEditorLaunch('C:/repo', { line: 42, path: 'design/F-010.md' })

        expect(command).toMatch(/^code -g "/)
        expect(command).toContain(':42"')
        expect(command).toContain('F-010.md')
    })

    it('rejects a diff file path that escapes the project root', () => {
        expect(() => buildEditorLaunch('C:/repo', { line: 1, path: '../secrets.txt' })).toThrow('escapes project root')
    })

    it('rejects an invalid editor line number', () => {
        expect(() => buildEditorLaunch('C:/repo', { line: 0, path: 'design/F-010.md' })).toThrow('Invalid editor line number')
    })

    it('spawns the editor launch command for a clicked line', () => {
        const child = { on: vi.fn() }
        const spawnProcess = vi.fn(() => child)
        openInEditor({ branch: 'main', id: 'local', rootPath: 'C:/repo' }, { line: 7, path: 'design/F-010.md' }, spawnProcess)

        expect(spawnProcess).toHaveBeenCalledWith(expect.stringContaining(':7"'), expect.objectContaining({ cwd: 'C:/repo', shell: true }))
    })
})

import { promises as fsPromises } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { AgentRunnerService } = require('./agent_runner_service')

function createProject(rootPath) {
    return { branch: 'main', id: 'local', rootPath }
}

function delay(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds)
    })
}

async function prepareProject(rootPath) {
    await mkdir(join(rootPath, '.git'))
    await mkdir(join(rootPath, 'design'))
}

function waitForEvent(events, type) {
    const existing = events.find((event) => event.type === type)
    if (existing) return Promise.resolve(existing)

    return new Promise((resolve) => {
        const interval = setInterval(() => {
            const event = events.find((item) => item.type === type)
            if (!event) return

            clearInterval(interval)
            resolve(event)
        }, 5)
    })
}

function waitForEventCount(events, type, count) {
    if (events.filter((event) => event.type === type).length >= count) return Promise.resolve()

    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (events.filter((event) => event.type === type).length < count) return

            clearInterval(interval)
            resolve()
        }, 5)
    })
}

describe('AgentRunnerService', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('streams stdout, forwards stdin and persists the card-linked log', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const events = []
        const command = 'node -e "process.stdin.on(\'data\', data => { process.stdout.write(data); if (String(data).includes(\'done\')) process.exit(0) })"'

        try {
            await prepareProject(rootPath)

            const result = await service.start(
                createProject(rootPath),
                {
                    cardPath: 'design/F-1.md',
                    command,
                    continuedFrom: '.md2-agent-logs/source.json',
                    nativeResumeSessionId: 'session-1',
                    prompt: 'hello',
                },
                (event) => events.push(event),
            )
            const runningContent = await readFile(join(rootPath, result.reference), 'utf8')
            expect(JSON.parse(runningContent).status).toBe('running')

            service.sendInput(result.runId, 'done')

            await waitForEvent(events, 'closed')

            const content = await readFile(join(rootPath, result.reference), 'utf8')
            const persisted = JSON.parse(content)

            expect(events.some((event) => event.type === 'stdout' && event.content.includes('hello'))).toBe(true)
            expect(events.some((event) => event.type === 'stdout' && event.content.includes('done'))).toBe(true)
            expect(persisted.cardPath).toBe('design/F-1.md')
            expect(persisted.continuedFrom).toBe('.md2-agent-logs/source.json')
            expect(persisted.nativeSessionId).toBe('session-1')
            expect(persisted.status).toBe('completed')
            expect(persisted.messages.map((message) => message.content).join('')).toContain('done')
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('returns buffered output for action chaining while streaming events', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const events = []
        const command = 'node -e "process.stdin.on(\'data\', data => { process.stdout.write(`out:${data}`); process.stderr.write(\'err\'); process.exit(0) })"'

        try {
            await prepareProject(rootPath)

            const result = await service.run(
                createProject(rootPath),
                { cardPath: 'design/F-1.md', command, prompt: 'hello' },
                (event) => events.push(event),
            )

            expect(result.exitCode).toBe(0)
            expect(result.stdout).toContain('out:hello')
            expect(result.stderr).toBe('err')
            expect(result.reference).toMatch(/^\.md2-agent-logs\//u)
            expect(events.map((event) => event.type)).toContain('stdout')
            expect(events.at(-1).type).toBe('closed')
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('includes spawn error events in the final stderr result', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const events = []
        const command = 'node -e "setTimeout(() => process.exit(1), 25)"'
        let completeRun
        const completion = new Promise((resolve) => {
            completeRun = resolve
        })

        try {
            await prepareProject(rootPath)

            const result = await service.start(
                createProject(rootPath),
                { cardPath: 'design/F-1.md', command, prompt: 'hello' },
                (event) => events.push(event),
                (_exitCode, run) => completeRun(run),
            )

            service.handleError(result.runId, new Error('spawn missing-agent ENOENT'))
            await waitForEvent(events, 'closed')
            const completedRun = await completion

            const content = await readFile(join(rootPath, result.reference), 'utf8')
            const persisted = JSON.parse(content)

            expect(completedRun.stderr).toContain('spawn missing-agent ENOENT')
            expect(events).toContainEqual(expect.objectContaining({ content: 'spawn missing-agent ENOENT', type: 'error' }))
            expect(persisted.status).toBe('failed')
            expect(persisted.events).toContainEqual(expect.objectContaining({ content: 'spawn missing-agent ENOENT', type: 'error' }))
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('captures a native session id from output when a pattern is configured', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const sessionId = '123e4567-e89b-12d3-a456-426614174000'
        const command = `node -e "process.stdin.on('data', () => { process.stdout.write('Session ID: ${sessionId}'); process.exit(0) })"`

        try {
            await prepareProject(rootPath)

            const result = await service.run(
                createProject(rootPath),
                {
                    cardPath: 'design/F-1.md',
                    command,
                    prompt: 'hello',
                    sessionIdPattern: 'Session ID: ([0-9a-f-]+)',
                },
                () => undefined,
            )
            const content = await readFile(join(rootPath, result.reference), 'utf8')
            const persisted = JSON.parse(content)

            expect(result.conversation.nativeSessionId).toBe(sessionId)
            expect(persisted.nativeSessionId).toBe(sessionId)
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('serializes rapid output writes so the final persisted status wins', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const events = []
        const command = 'node -e "process.stdin.on(\'data\', data => { if (String(data).includes(\'done\')) process.exit(0) })"'
        const originalWriteFile = fsPromises.writeFile.bind(fsPromises)
        const writeFileSpy = vi.spyOn(fsPromises, 'writeFile')

        writeFileSpy.mockImplementation(async (filePath, data) => {
            const content = typeof data === 'string' ? data : data.toString()
            const parsed = JSON.parse(content)
            if (parsed.status === 'running' && parsed.messages.length > 1) {
                await delay(20)
            }

            return originalWriteFile(filePath, data)
        })

        try {
            await prepareProject(rootPath)

            const result = await service.start(
                createProject(rootPath),
                { cardPath: 'design/F-1.md', command, prompt: 'hello' },
                (event) => events.push(event),
            )

            for (let idx = 0; idx < 20; idx++) {
                service.handleOutput(result.runId, 'stdout', Buffer.from(`chunk-${idx}\n`))
            }
            service.sendInput(result.runId, 'done')

            await waitForEvent(events, 'closed')

            const content = await readFile(join(rootPath, result.reference), 'utf8')
            const persisted = JSON.parse(content)
            expect(persisted.status).toBe('completed')
            expect(persisted.messages.map((message) => message.content).join('')).toContain('chunk-19')
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('throttles rapid intermediate output persists', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const events = []
        const command = 'node -e "process.stdin.on(\'data\', data => { if (String(data).includes(\'done\')) process.exit(0) })"'
        const writeFileSpy = vi.spyOn(fsPromises, 'writeFile')

        try {
            await prepareProject(rootPath)

            const result = await service.start(
                createProject(rootPath),
                { cardPath: 'design/F-1.md', command, prompt: 'hello' },
                (event) => events.push(event),
            )
            writeFileSpy.mockClear()

            for (let idx = 0; idx < 20; idx++) {
                service.handleOutput(result.runId, 'stdout', Buffer.from(`chunk-${idx}\n`))
            }
            service.sendInput(result.runId, 'done')

            await waitForEvent(events, 'closed')

            const writePaths = writeFileSpy.mock.calls.map(([filePath]) => String(filePath))
            expect(writePaths.filter((filePath) => filePath.endsWith('.json.tmp'))).toHaveLength(3)
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('writes logs atomically through a temporary file replace', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const command = 'node -e "process.stdin.on(\'data\', () => process.exit(0))"'
        const renameSpy = vi.spyOn(fsPromises, 'rename')
        const writeFileSpy = vi.spyOn(fsPromises, 'writeFile')

        try {
            await prepareProject(rootPath)

            const result = await service.run(
                createProject(rootPath),
                { cardPath: 'design/F-1.md', command, prompt: 'hello' },
                () => undefined,
            )

            const temporaryPath = join(rootPath, result.reference).replace(/\.json$/u, '.json.tmp')
            const finalPath = join(rootPath, result.reference)
            expect(writeFileSpy.mock.calls.every(([filePath]) => String(filePath).endsWith('.tmp'))).toBe(true)
            expect(renameSpy.mock.calls.some(([fromPath, toPath]) => fromPath === temporaryPath && toPath === finalPath)).toBe(true)
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('creates distinct ids and log files for runs started in the same millisecond', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const events = []
        const command = 'node -e "setTimeout(() => process.exit(0), 25)"'
        vi.spyOn(Date, 'now').mockReturnValue(123)

        try {
            await prepareProject(rootPath)

            const first = await service.start(
                createProject(rootPath),
                { cardPath: 'design/F-1.md', command, prompt: 'hello' },
                (event) => events.push(event),
            )
            const second = await service.start(
                createProject(rootPath),
                { cardPath: 'design/F-1.md', command, prompt: 'hello' },
                (event) => events.push(event),
            )

            expect(first.runId).not.toBe(second.runId)
            expect(first.reference).not.toBe(second.reference)

            await waitForEventCount(events, 'closed', 2)
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('rejects log paths that escape the project root', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()

        try {
            await mkdir(join(rootPath, '.git'))

            await expect(service.start(
                { branch: 'main', id: 'local', rootPath },
                { cardPath: '../outside.md', command: 'node -e ""', prompt: 'hello' },
                () => undefined,
            )).rejects.toThrow('Local Git path escapes project root')
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })
})

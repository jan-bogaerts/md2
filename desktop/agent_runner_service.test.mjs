import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { AgentRunnerService } = require('./agent_runner_service')

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

describe('AgentRunnerService', () => {
    it('streams stdout, forwards stdin and persists the card-linked log', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const events = []
        const command = 'node -e "process.stdin.on(\'data\', data => { process.stdout.write(data); if (String(data).includes(\'done\')) process.exit(0) })"'

        try {
            await mkdir(join(rootPath, '.git'))
            await mkdir(join(rootPath, 'design'))

            const result = await service.start(
                { branch: 'main', id: 'local', rootPath },
                { cardPath: 'design/F-1.md', command, prompt: 'hello' },
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
            await mkdir(join(rootPath, '.git'))
            await mkdir(join(rootPath, 'design'))

            const result = await service.run(
                { branch: 'main', id: 'local', rootPath },
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

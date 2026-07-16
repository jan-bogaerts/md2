import { promises as fsPromises } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { AgentRunnerService } = require('./agent_runner_service')

function createProject(rootPath) {
    return { branch: 'main', id: 'local', rootPath }
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

    it('uses pipes and passes normalized prompt as one argument', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const prompt = 'Reply with exactly: spawn test ok'
        const scriptPath = join(rootPath, 'read-prompt.cjs')

        try {
            await prepareProject(rootPath)
            await writeFile(scriptPath, 'process.stdout.write(JSON.stringify({prompt:process.argv[2],tty:process.stdin.isTTY===true}))\n')
            const command = ['node', scriptPath]
            const result = await service.run(createProject(rootPath), { command, prompt, scopePath: 'project' }, () => undefined)

            expect(result.stderr).toBe('')
            expect(result.exitCode).toBe(0)
            expect(JSON.parse(result.stdout)).toEqual({ prompt, tty: false })
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('passes large transcript context through stdin', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const contextInput = 'history\n'.repeat(20000)
        const scriptPath = join(rootPath, 'read-context.cjs')

        try {
            await prepareProject(rootPath)
            await writeFile(scriptPath, "let value='';process.stdin.on('data',chunk=>value+=chunk);process.stdin.on('end',()=>process.stdout.write(String(value.length)))\n")
            const command = ['node', scriptPath]
            const result = await service.run(createProject(rootPath), { command, contextInput, prompt: 'next', scopePath: 'project' }, () => undefined)

            expect(result.stdout).toBe(String(contextInput.length))
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('runs configured executable directly through shell', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const scriptPath = join(rootPath, 'test-agent-script.cjs')
        const prompt = 'spawn test ok'

        try {
            await prepareProject(rootPath)
            await writeFile(scriptPath, 'process.stdout.write(JSON.stringify(process.argv[3]))\n')
            const result = await service.run(createProject(rootPath), {
                command: ['node', scriptPath, 'marker'],
                prompt,
                scopePath: 'project',
            }, () => undefined)

            expect(result.stderr).toBe('')
            expect(result.exitCode).toBe(0)
            expect(JSON.parse(result.stdout)).toBe(prompt)
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('streams structured events and persists assistant text separately from protocol events', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const events = []
        const scriptPath = join(rootPath, 'structured-output.cjs')

        try {
            await prepareProject(rootPath)
            await writeFile(scriptPath, "console.log(JSON.stringify({type:'thread.started',thread_id:'thread-1'}));console.log(JSON.stringify({type:'turn.started'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'answer'}}))\n")
            const command = ['node', scriptPath]
            const result = await service.run(createProject(rootPath), {
                agent: 'codex',
                cardPath: 'design/F-1.md',
                command,
                prompt: 'question',
            }, (event) => events.push(event))
            const persisted = JSON.parse(await readFile(join(rootPath, result.reference), 'utf8'))

            expect(events).toContainEqual(expect.objectContaining({ content: 'answer', type: 'output' }))
            expect(persisted.messages).toEqual([
                expect.objectContaining({ content: 'question', role: 'user' }),
                expect.objectContaining({ agent: 'codex', content: 'answer', role: 'assistant' }),
            ])
            expect(persisted.events).toContainEqual(expect.objectContaining({ type: 'thread.started' }))
            expect(persisted.providerSessions).toEqual([expect.objectContaining({ agent: 'codex', conversationId: 'thread-1' })])
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('fails a new provider turn without an explicit structured conversation id', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const scriptPath = join(rootPath, 'missing-session.cjs')

        try {
            await prepareProject(rootPath)
            await writeFile(scriptPath, "console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'partial answer'}}))\n")
            const result = await service.run(createProject(rootPath), {
                agent: 'codex',
                command: ['node', scriptPath],
                prompt: 'question',
                scopePath: 'project',
            }, () => undefined)
            const persisted = JSON.parse(await readFile(join(rootPath, result.reference), 'utf8'))

            expect(result.exitCode).not.toBe(0)
            expect(persisted.status).toBe('failed')
            expect(persisted.messages.at(-1)).toMatchObject({ content: 'partial answer', role: 'assistant' })
            expect(persisted.events).toContainEqual(expect.objectContaining({ content: 'Missing codex conversation id in structured output', type: 'error' }))
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('fails malformed provider JSONL visibly without storing it as assistant text', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const events = []
        const scriptPath = join(rootPath, 'malformed-output.cjs')

        try {
            await prepareProject(rootPath)
            await writeFile(scriptPath, "console.log('not-json')\n")
            const result = await service.run(createProject(rootPath), {
                agent: 'claude',
                command: ['node', scriptPath],
                prompt: 'question',
                scopePath: 'project',
            }, (event) => events.push(event))
            const persisted = JSON.parse(await readFile(join(rootPath, result.reference), 'utf8'))

            expect(result.exitCode).not.toBe(0)
            expect(events).toContainEqual(expect.objectContaining({ type: 'error' }))
            expect(persisted.status).toBe('failed')
            expect(persisted.messages).toHaveLength(1)
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('cancels only the active turn without advancing its provider cursor', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const events = []
        const conversation = {
            actionId: 'implement', completedAt: 'earlier', events: [], id: 'conversation-1',
            messages: [{ content: 'old', id: 'message-1', role: 'user', timestamp: 'earlier' }],
            providerSessions: [{ agent: 'codex', conversationId: 'thread-1', createdAt: 'earlier', lastUsedAt: 'earlier', synchronizedThroughMessageId: 'message-1' }],
            startedAt: 'earlier', status: 'completed', title: 'Implement',
        }

        try {
            await prepareProject(rootPath)
            const started = await service.start(createProject(rootPath), {
                agent: 'codex', command: ['node', '-e', 'setTimeout(()=>{},10000)'], conversation,
                prompt: 'next', reference: '.md2-agent-logs/conversation.json', scopePath: 'project',
            }, (event) => events.push(event))
            service.stop(started.runId)
            await waitForEvent(events, 'closed')
            const persisted = JSON.parse(await readFile(join(rootPath, started.reference), 'utf8'))

            expect(persisted.status).toBe('cancelled')
            expect(persisted.providerSessions[0].synchronizedThroughMessageId).toBe('message-1')
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('rejects concurrent turns for one conversation while allowing separate conversations', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const events = []
        const conversation = {
            actionId: null, completedAt: null, events: [], id: 'conversation-1', messages: [], providerSessions: [],
            startedAt: 'earlier', status: 'completed', title: 'Agent',
        }

        try {
            await prepareProject(rootPath)
            const first = await service.start(createProject(rootPath), {
                command: ['node', '-e', 'setTimeout(()=>process.exit(0),100)'], conversation,
                prompt: 'one', reference: '.md2-agent-logs/one.json', scopePath: 'project',
            }, (event) => events.push(event))

            await expect(service.start(createProject(rootPath), {
                command: ['node', '-e', 'process.exit(0)'], conversation,
                prompt: 'two', reference: '.md2-agent-logs/one.json', scopePath: 'project',
            }, () => undefined)).rejects.toThrow('already has a running turn')
            const second = await service.start(createProject(rootPath), {
                command: ['node', '-e', 'process.exit(0)'], prompt: 'other', scopePath: 'project',
            }, (event) => events.push(event))

            service.stop(first.runId)
            await waitForEventCount(events, 'closed', 2)
            expect(second.reference).not.toBe(first.reference)
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })

    it('writes final completion atomically before reporting closed', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'))
        const service = new AgentRunnerService()
        const renameSpy = vi.spyOn(fsPromises, 'rename')

        try {
            await prepareProject(rootPath)
            const result = await service.run(createProject(rootPath), {
                command: ['node', '-e', "process.stdout.write('done')"], prompt: 'go', scopePath: 'project',
            }, () => undefined)
            const persisted = JSON.parse(await readFile(join(rootPath, result.reference), 'utf8'))

            expect(persisted.status).toBe('completed')
            expect(renameSpy.mock.calls.some(([from, to]) => String(from).endsWith('.tmp') && to === join(rootPath, result.reference))).toBe(true)
        } finally {
            await rm(rootPath, { force: true, recursive: true })
        }
    })
})

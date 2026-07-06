const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const AGENT_LOG_FOLDER = '.md2-agent-logs'

function normalizePath(filePath) {
    return filePath.replace(/\\/g, '/')
}

function safePathSegment(value) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function requireRootPath(project) {
    if (!project || typeof project.rootPath !== 'string' || project.rootPath.length === 0) {
        throw new Error('Missing local Git project rootPath')
    }

    return project.rootPath
}

function ensureInsideRoot(rootPath, targetPath) {
    const resolvedRoot = path.resolve(rootPath)
    const resolvedTarget = path.resolve(targetPath)

    if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
        throw new Error('Local Git path escapes project root')
    }

    return resolvedTarget
}

async function pathExists(targetPath) {
    try {
        await fs.promises.access(targetPath)
        return true
    } catch {
        return false
    }
}

async function assertGitRoot(rootPath) {
    const gitPath = path.join(rootPath, '.git')

    if (!await pathExists(gitPath)) throw new Error('Selected folder must contain a .git directory')
}

function requireString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing agent ${fieldName}`)

    return value
}

function createMessage(id, role, content, timestamp) {
    return { content, id, role, timestamp }
}

function createEvent(id, type, content, timestamp) {
    return { content, id, timestamp, type }
}

function agentLogFilePath(rootPath, cardPath, id) {
    const folderPath = ensureInsideRoot(rootPath, path.join(rootPath, AGENT_LOG_FOLDER))
    const fileName = `${safePathSegment(cardPath)}_${safePathSegment(id)}.json`

    return ensureInsideRoot(rootPath, path.join(folderPath, fileName))
}

function emitRunEvent(run, type, content) {
    if (!run.onEvent) return

    run.onEvent({
        content,
        conversation: { ...run.conversation, path: run.reference },
        runId: run.conversation.id,
        type,
    })
}

async function persistConversation(filePath, conversation) {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(filePath, `${JSON.stringify(conversation, null, 2)}\n`)
}

class AgentRunnerService {
    constructor() {
        this.processes = new Map()
    }

    async run(project, request, onEvent) {
        let resolveCompletion
        const completion = new Promise((resolve) => {
            resolveCompletion = resolve
        })
        const onComplete = (exitCode, run) => {
            resolveCompletion({
                command: request.command,
                conversation: { ...run.conversation, path: run.reference },
                exitCode,
                prompt: request.prompt,
                reference: run.reference,
                runId: run.conversation.id,
                stderr: run.stderr,
                stdout: run.stdout,
            })
        }

        await this.start(project, request, onEvent, onComplete)

        return completion
    }

    async start(project, request, onEvent, onComplete) {
        const rootPath = requireRootPath(project)
        await assertGitRoot(rootPath)

        const command = requireString(request?.command, 'command')
        const cardPath = requireString(request?.cardPath, 'cardPath')
        const prompt = requireString(request?.prompt, 'prompt')
        ensureInsideRoot(rootPath, path.join(rootPath, cardPath))

        const id = `agent-${Date.now()}-${this.processes.size + 1}`
        const startedAt = new Date().toISOString()
        const filePath = agentLogFilePath(rootPath, cardPath, id)
        const reference = normalizePath(path.relative(rootPath, filePath))
        const title = typeof request.title === 'string' && request.title.length > 0 ? request.title : 'Agent run'
        const conversation = {
            cardPath,
            completedAt: null,
            events: [createEvent(`${id}-started`, 'started', command, startedAt)],
            id,
            messages: [createMessage(`${id}-prompt`, 'user', prompt, startedAt)],
            startedAt,
            status: 'running',
            title,
        }

        await persistConversation(filePath, conversation)

        const child = spawn(command, { cwd: rootPath, shell: true })
        const run = { child, conversation, filePath, onComplete, onEvent, reference, stderr: '', stdout: '' }
        this.processes.set(id, run)

        child.stdout.on('data', (chunk) => this.handleOutput(id, 'stdout', chunk))
        child.stderr.on('data', (chunk) => this.handleOutput(id, 'stderr', chunk))
        child.on('error', (error) => this.handleError(id, error))
        child.on('close', (code) => {
            void this.handleClose(id, typeof code === 'number' ? code : 1)
        })

        child.stdin.write(`${prompt}\n`)
        emitRunEvent(run, 'started', '')

        return { conversation: { ...conversation, path: reference }, reference, runId: id }
    }

    sendInput(runId, input) {
        const run = this.requireRun(runId)
        const content = requireString(input, 'input')
        const timestamp = new Date().toISOString()
        const message = createMessage(`${runId}-input-${run.conversation.messages.length}`, 'user', content, timestamp)
        run.conversation.messages.push(message)
        run.child.stdin.write(`${content}\n`)
        void persistConversation(run.filePath, run.conversation)
        emitRunEvent(run, 'stdin', content)
    }

    stop(runId) {
        const run = this.requireRun(runId)
        run.child.kill()
    }

    stopAll() {
        for (const run of this.processes.values()) {
            run.child.kill()
        }
    }

    handleOutput(runId, role, chunk) {
        const run = this.processes.get(runId)
        if (!run) return

        const content = chunk.toString()
        const timestamp = new Date().toISOString()
        run[role] += content
        run.conversation.messages.push(createMessage(`${runId}-${role}-${run.conversation.messages.length}`, role, content, timestamp))
        run.conversation.events.push(createEvent(`${runId}-${role}-${run.conversation.events.length}`, role, content, timestamp))
        void persistConversation(run.filePath, run.conversation)
        emitRunEvent(run, role, content)
    }

    handleError(runId, error) {
        const run = this.processes.get(runId)
        if (!run) return

        const timestamp = new Date().toISOString()
        const message = error instanceof Error ? error.message : 'Agent process failed'
        run.conversation.messages.push(createMessage(`${runId}-error`, 'stderr', message, timestamp))
        run.conversation.events.push(createEvent(`${runId}-error`, 'error', message, timestamp))
        void persistConversation(run.filePath, run.conversation)
        emitRunEvent(run, 'error', message)
    }

    async handleClose(runId, exitCode) {
        const run = this.processes.get(runId)
        if (!run) return

        const completedAt = new Date().toISOString()
        run.conversation.completedAt = completedAt
        run.conversation.status = exitCode === 0 ? 'completed' : 'failed'
        run.conversation.events.push(createEvent(`${runId}-closed`, 'closed', String(exitCode), completedAt))
        await persistConversation(run.filePath, run.conversation)
        emitRunEvent(run, 'closed', String(exitCode))
        if (run.onComplete) run.onComplete(exitCode, run)
        this.processes.delete(runId)
    }

    requireRun(runId) {
        const run = this.processes.get(runId)
        if (!run) throw new Error(`Agent run is not active: ${runId}`)

        return run
    }
}

module.exports = { AgentRunnerService }

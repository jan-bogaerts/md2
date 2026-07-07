const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const AGENT_LOG_FOLDER = '.md2-agent-logs'
const INTERMEDIATE_PERSIST_INTERVAL_MS = 250

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

function readOptionalString(value, fieldName) {
    if (value === undefined || value === null) return null
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing agent ${fieldName}`)

    return value
}

function readOptionalPattern(value, fieldName) {
    const pattern = readOptionalString(value, fieldName)
    if (!pattern) return null

    try {
        new RegExp(pattern, 'u')
    } catch {
        throw new Error(`Invalid agent ${fieldName}`)
    }

    return pattern
}

function captureNativeSessionId(output, pattern) {
    if (!pattern) return null

    const match = new RegExp(pattern, 'u').exec(output)
    const sessionId = match?.[1]
    if (typeof sessionId !== 'string' || sessionId.length === 0) return null

    return sessionId
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
    const temporaryPath = `${filePath}.tmp`

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(conversation, null, 2)}\n`)
    await fs.promises.rename(temporaryPath, filePath)
}

function appendWriteError(run, error) {
    const timestamp = new Date().toISOString()
    const message = error instanceof Error ? error.message : 'Agent log write failed'
    run.conversation.events.push(createEvent(`${run.conversation.id}-write-error-${run.conversation.events.length}`, 'error', message, timestamp))
    emitRunEvent(run, 'error', message)
}

function queueConversationPersist(run) {
    run.writeChain = run.writeChain.then(async () => {
        try {
            await persistConversation(run.filePath, run.conversation)
        } catch (error) {
            appendWriteError(run, error)
        }
    })

    return run.writeChain
}

function clearIntermediatePersist(run) {
    if (!run.intermediatePersistTimer) return

    clearTimeout(run.intermediatePersistTimer)
    run.intermediatePersistTimer = null
}

function queueThrottledConversationPersist(run) {
    const now = Date.now()
    const elapsed = now - run.lastIntermediatePersistAt
    if (elapsed >= INTERMEDIATE_PERSIST_INTERVAL_MS) {
        run.lastIntermediatePersistAt = now

        return queueConversationPersist(run)
    }

    if (!run.intermediatePersistTimer) {
        const delay = INTERMEDIATE_PERSIST_INTERVAL_MS - elapsed
        run.intermediatePersistTimer = setTimeout(() => {
            run.intermediatePersistTimer = null
            run.lastIntermediatePersistAt = Date.now()
            void queueConversationPersist(run)
        }, delay)
    }

    return run.writeChain
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
        const sessionIdPattern = readOptionalPattern(request?.sessionIdPattern, 'sessionIdPattern')
        ensureInsideRoot(rootPath, path.join(rootPath, cardPath))

        const id = `agent-${crypto.randomUUID()}`
        const startedAt = new Date().toISOString()
        const filePath = agentLogFilePath(rootPath, cardPath, id)
        const reference = normalizePath(path.relative(rootPath, filePath))
        const title = typeof request.title === 'string' && request.title.length > 0 ? request.title : 'Agent run'
        const conversation = {
            cardPath,
            completedAt: null,
            continuedFrom: typeof request.continuedFrom === 'string' && request.continuedFrom.length > 0 ? request.continuedFrom : null,
            events: [createEvent(`${id}-started`, 'started', command, startedAt)],
            id,
            messages: [createMessage(`${id}-prompt`, 'user', prompt, startedAt)],
            nativeSessionId: typeof request.nativeResumeSessionId === 'string' && request.nativeResumeSessionId.length > 0
                ? request.nativeResumeSessionId
                : null,
            startedAt,
            status: 'running',
            title,
        }

        await persistConversation(filePath, conversation)

        const child = spawn(command, { cwd: rootPath, shell: true })
        const run = {
            child,
            conversation,
            filePath,
            intermediatePersistTimer: null,
            lastIntermediatePersistAt: 0,
            onComplete,
            onEvent,
            reference,
            sessionIdPattern,
            stderr: '',
            stdout: '',
            writeChain: Promise.resolve(),
        }
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
        void queueConversationPersist(run)
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
        void queueThrottledConversationPersist(run)
        emitRunEvent(run, role, content)
    }

    handleError(runId, error) {
        const run = this.processes.get(runId)
        if (!run) return

        const timestamp = new Date().toISOString()
        const message = error instanceof Error ? error.message : 'Agent process failed'
        run.conversation.messages.push(createMessage(`${runId}-error`, 'stderr', message, timestamp))
        run.conversation.events.push(createEvent(`${runId}-error`, 'error', message, timestamp))
        void queueConversationPersist(run)
        emitRunEvent(run, 'error', message)
    }

    async handleClose(runId, exitCode) {
        const run = this.processes.get(runId)
        if (!run) return

        clearIntermediatePersist(run)
        await run.writeChain
        const completedAt = new Date().toISOString()
        const nativeSessionId = captureNativeSessionId(`${run.stdout}${run.stderr}`, run.sessionIdPattern)
        if (nativeSessionId) run.conversation.nativeSessionId = nativeSessionId
        run.conversation.completedAt = completedAt
        run.conversation.status = exitCode === 0 ? 'completed' : 'failed'
        run.conversation.events.push(createEvent(`${runId}-closed`, 'closed', String(exitCode), completedAt))
        await queueConversationPersist(run)
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

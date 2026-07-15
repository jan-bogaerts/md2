const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const { createAgentProviderProtocolParser } = require('./agent_provider_protocol')

const AGENT_LOG_FOLDER = '.md2-agent-logs'
const INTERMEDIATE_PERSIST_INTERVAL_MS = 250
const POWERSHELL_AGENT_SCRIPT = [
    '$agentArguments = ConvertFrom-Json $env:MD2_AGENT_ARGUMENTS',
    '$agentCommand = Get-Command $env:MD2_AGENT_EXECUTABLE -ErrorAction Stop',
    'if ($agentCommand.CommandType -eq "Application") { $agentArguments = @($agentArguments | ForEach-Object { $_ -replace \'"\', \'\\"\' }) }',
    '& $agentCommand.Source @agentArguments',
    'exit $LASTEXITCODE',
].join('; ')

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
    if (!await pathExists(path.join(rootPath, '.git'))) throw new Error('Selected folder must contain a .git directory')
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

function splitWindowsCommandLine(command) {
    const argumentsList = []
    let index = 0

    while (index < command.length) {
        while (/\s/u.test(command[index])) index += 1
        if (index >= command.length) break

        let argument = ''
        let insideQuotes = false
        while (index < command.length && (insideQuotes || !/\s/u.test(command[index]))) {
            if (command[index] !== '\\') {
                if (command[index] === '"') insideQuotes = !insideQuotes
                else argument += command[index]
                index += 1
                continue
            }

            const backslashStart = index
            while (command[index] === '\\') index += 1
            const backslashCount = index - backslashStart
            if (command[index] !== '"') {
                argument += '\\'.repeat(backslashCount)
                continue
            }

            argument += '\\'.repeat(Math.floor(backslashCount / 2))
            if (backslashCount % 2 === 1) argument += '"'
            else insideQuotes = !insideQuotes
            index += 1
        }
        argumentsList.push(argument)
    }

    return argumentsList
}

function quotePosixShellArgument(value) {
    return `'${value.replaceAll("'", `'"'"'`)}'`
}

function createProcessInvocation(command, prompt) {
    if (process.platform === 'win32') {
        const [executable, ...configuredArguments] = splitWindowsCommandLine(command)
        if (!executable) throw new Error('Missing agent command executable')
        const agentArguments = [...configuredArguments, prompt]
        if (/\.(?:bat|cmd)$/iu.test(executable)) {
            return {
                args: ['/d', '/s', '/v:on', '/c', `"${command} "!MD2_AGENT_PROMPT!""`],
                env: { ...process.env, MD2_AGENT_PROMPT: prompt.replaceAll('"', '\\"') },
                executable: process.env.ComSpec ?? 'cmd.exe',
                windowsVerbatimArguments: true,
            }
        }

        return {
            args: ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL_AGENT_SCRIPT],
            env: { ...process.env, MD2_AGENT_ARGUMENTS: JSON.stringify(agentArguments), MD2_AGENT_EXECUTABLE: executable },
            executable: process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe',
        }
    }

    return {
        args: ['-lc', `${command} ${quotePosixShellArgument(prompt)}`],
        env: process.env,
        executable: process.env.SHELL ?? '/bin/sh',
    }
}

function terminateProcess(child) {
    if (process.platform !== 'win32' || !child.pid) {
        child.kill()
        return Promise.resolve()
    }

    return new Promise((resolve) => {
        const terminator = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
        terminator.on('error', () => {
            child.kill()
            resolve()
        })
        terminator.on('close', resolve)
    })
}

function createMessage(id, role, content, timestamp, agent) {
    return { ...(agent ? { agent } : {}), content, id, role, timestamp }
}

function createEvent(id, type, content, timestamp) {
    return { content, id, timestamp, type }
}

function agentLogFilePath(rootPath, scopePath, id) {
    const folderPath = ensureInsideRoot(rootPath, path.join(rootPath, AGENT_LOG_FOLDER))
    const fileName = `${safePathSegment(scopePath)}_${safePathSegment(id)}.json`

    return ensureInsideRoot(rootPath, path.join(folderPath, fileName))
}

function existingLogFilePath(rootPath, reference) {
    return ensureInsideRoot(rootPath, path.join(rootPath, reference))
}

function emitRunEvent(run, type, content) {
    if (!run.onEvent) return

    run.onEvent({ content, conversation: { ...run.conversation, path: run.reference }, runId: run.id, type })
}

async function persistConversation(filePath, conversation) {
    const temporaryPath = `${filePath}.tmp`

    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    await fs.promises.writeFile(temporaryPath, `${JSON.stringify(conversation, null, 2)}\n`)
    await fs.promises.rename(temporaryPath, filePath)
}

function queueConversationPersist(run) {
    run.writeChain = run.writeChain.then(async () => persistConversation(run.filePath, run.conversation))

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

function createConversation(request, id, startedAt) {
    if (request.conversation) {
        const persistedEntries = Object.entries(request.conversation).filter(([fieldName]) => fieldName !== 'path')
        const persistedConversation = Object.fromEntries(persistedEntries)

        return {
            ...persistedConversation,
            completedAt: null,
            events: [...request.conversation.events],
            messages: [...request.conversation.messages],
            providerSessions: [...(request.conversation.providerSessions ?? [])],
            status: 'running',
        }
    }

    return {
        actionId: readOptionalString(request.actionId, 'actionId'),
        ...(request.cardPath ? { cardPath: request.cardPath } : {}),
        completedAt: null,
        events: [],
        id,
        messages: [],
        providerSessions: [],
        startedAt,
        status: 'running',
        title: typeof request.title === 'string' && request.title.length > 0 ? request.title : 'Agent run',
    }
}

function updateProviderSession(run, synchronizedThroughMessageId, completedAt) {
    const conversationId = run.providerConversationId ?? run.request.providerConversationId
    if (!conversationId) return

    const sessions = run.conversation.providerSessions
    const current = sessions.find(({ agent }) => agent === run.agent)
    const nextSession = {
        agent: run.agent,
        conversationId,
        createdAt: current?.createdAt ?? completedAt,
        lastUsedAt: completedAt,
        synchronizedThroughMessageId,
    }
    run.conversation.providerSessions = current
        ? sessions.map((session) => (session.agent === run.agent ? nextSession : session))
        : [...sessions, nextSession]
}

function hasRequiredProviderConversationId(run) {
    if (run.agent !== 'codex' && run.agent !== 'claude') return true

    return !!(run.providerConversationId ?? run.request.providerConversationId)
}

function createRunResult(request, exitCode, run) {
    return {
        command: request.command,
        conversation: { ...run.conversation, path: run.reference },
        exitCode,
        missingSession: run.missingSession,
        prompt: request.prompt,
        reference: run.reference,
        runId: run.id,
        stderr: run.stderr,
        stdout: run.stdout,
        turnStarted: run.turnStarted,
    }
}

class AgentRunnerService {
    constructor() {
        this.processes = new Map()
        this.runningConversationIds = new Set()
    }

    async run(project, request, onEvent) {
        let resolveCompletion
        let rejectCompletion
        const completion = new Promise((resolve, reject) => {
            resolveCompletion = resolve
            rejectCompletion = reject
        })
        const onComplete = (exitCode, run) => resolveCompletion(createRunResult(request, exitCode, run))
        const onCompletionError = (error) => rejectCompletion(error)

        await this.start(project, request, onEvent, onComplete, onCompletionError)

        return completion
    }

    async start(project, request, onEvent, onComplete, onCompletionError) {
        const rootPath = requireRootPath(project)
        await assertGitRoot(rootPath)
        const command = requireString(request?.command, 'command')
        const cardPath = readOptionalString(request?.cardPath, 'cardPath')
        const scopePath = requireString(request?.scopePath ?? cardPath, 'scopePath')
        const prompt = requireString(request?.prompt, 'prompt')
        const agent = requireString(request?.agent ?? 'generic', 'agent')
        if (cardPath) ensureInsideRoot(rootPath, path.join(rootPath, cardPath))

        const id = `agent-turn-${crypto.randomUUID()}`
        const startedAt = new Date().toISOString()
        const conversation = createConversation(request, `agent-${crypto.randomUUID()}`, startedAt)
        if (this.runningConversationIds.has(conversation.id)) throw new Error(`Agent conversation already has a running turn: ${conversation.id}`)
        const filePath = request.reference
            ? existingLogFilePath(rootPath, request.reference)
            : agentLogFilePath(rootPath, scopePath, conversation.id)
        const reference = request.reference ?? normalizePath(path.relative(rootPath, filePath))
        const lastMessage = conversation.messages.at(-1)
        if (request.reuseLastUserMessage) {
            if (lastMessage?.role !== 'user' || lastMessage.content !== prompt) throw new Error('Missing failed-turn user message for agent retry')
        } else {
            conversation.messages.push(createMessage(`${id}-user`, 'user', prompt, startedAt))
        }
        conversation.events.push(createEvent(`${id}-started`, 'started', command, startedAt))
        await persistConversation(filePath, conversation)

        const invocation = createProcessInvocation(command, prompt)
        const child = spawn(invocation.executable, invocation.args, {
            cwd: rootPath,
            env: invocation.env,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsVerbatimArguments: invocation.windowsVerbatimArguments ?? false,
            windowsHide: true,
        })
        const run = {
            agent,
            cancelled: false,
            child,
            conversation,
            filePath,
            id,
            intermediatePersistTimer: null,
            lastIntermediatePersistAt: 0,
            malformedOutput: false,
            missingSession: false,
            onComplete,
            onCompletionError,
            onEvent,
            providerConversationId: null,
            reference,
            request,
            stderr: '',
            stdout: '',
            turnStarted: false,
            termination: null,
            writeChain: Promise.resolve(),
        }
        run.parser = createAgentProviderProtocolParser(
            agent,
            (event) => this.handleProviderEvent(id, event),
            (line) => this.handleMalformedOutput(id, line),
        )
        this.processes.set(id, run)
        this.runningConversationIds.add(conversation.id)

        child.stdout.on('data', (chunk) => this.handleOutput(id, 'stdout', chunk))
        child.stderr.on('data', (chunk) => this.handleOutput(id, 'stderr', chunk))
        child.on('error', (error) => this.handleError(id, error))
        child.on('close', (exitCode) => {
            void this.handleClose(id, exitCode ?? 1)
        })
        if (typeof request.contextInput === 'string' && request.contextInput.length > 0) child.stdin.write(request.contextInput)
        child.stdin.end()
        emitRunEvent(run, 'started', '')

        return { conversation: { ...conversation, path: reference }, reference, runId: id }
    }

    stop(runId) {
        const run = this.requireRun(runId)
        run.cancelled = true
        run.termination = terminateProcess(run.child)
    }

    stopAll() {
        for (const run of this.processes.values()) {
            run.cancelled = true
            run.termination = terminateProcess(run.child)
        }
    }

    handleOutput(runId, channel, chunk) {
        const run = this.processes.get(runId)
        if (!run) return

        const content = chunk.toString()
        if (channel === 'stdout' && run.parser) {
            run.parser.push(chunk)
            return
        }
        if (channel === 'stdout') run.stdout += content
        else run.stderr += content
        const timestamp = new Date().toISOString()
        run.conversation.events.push(createEvent(`${runId}-${channel}-${run.conversation.events.length}`, channel, content, timestamp))
        void queueThrottledConversationPersist(run)
        emitRunEvent(run, channel, content)
    }

    handleProviderEvent(runId, providerEvent) {
        const run = this.processes.get(runId)
        if (!run) return

        const timestamp = new Date().toISOString()
        run.turnStarted = run.turnStarted || providerEvent.turnStarted
        run.missingSession = run.missingSession || providerEvent.missingSession
        if (providerEvent.conversationId) run.providerConversationId = providerEvent.conversationId
        run.conversation.events.push(createEvent(
            `${runId}-provider-${run.conversation.events.length}`,
            providerEvent.type,
            JSON.stringify(providerEvent.event),
            timestamp,
        ))
        if (providerEvent.assistantText.length > 0) {
            run.stdout += providerEvent.assistantText
            emitRunEvent(run, 'output', providerEvent.assistantText)
        } else {
            emitRunEvent(run, 'provider', JSON.stringify(providerEvent.event))
        }
        void queueThrottledConversationPersist(run)
    }

    handleMalformedOutput(runId, line) {
        const run = this.processes.get(runId)
        if (!run) return

        run.malformedOutput = true
        const timestamp = new Date().toISOString()
        const message = `Malformed ${run.agent} JSONL event: ${line}`
        run.stderr += message
        run.conversation.events.push(createEvent(`${runId}-malformed-${run.conversation.events.length}`, 'error', message, timestamp))
        emitRunEvent(run, 'error', message)
        run.termination = terminateProcess(run.child)
    }

    handleError(runId, error) {
        const run = this.processes.get(runId)
        if (!run) return

        const timestamp = new Date().toISOString()
        const message = error instanceof Error ? error.message : 'Agent process failed'
        run.stderr += message
        run.conversation.events.push(createEvent(`${runId}-error-${run.conversation.events.length}`, 'error', message, timestamp))
        void queueConversationPersist(run)
        emitRunEvent(run, 'error', message)
    }

    async handleClose(runId, exitCode) {
        const run = this.processes.get(runId)
        if (!run) return

        try {
            if (run.termination) await run.termination
            run.parser?.finish()
            clearIntermediatePersist(run)
            await run.writeChain
            const completedAt = new Date().toISOString()
            const providerConversationIdPresent = hasRequiredProviderConversationId(run)
            const succeeded = exitCode === 0
                && !run.malformedOutput
                && !run.missingSession
                && !run.cancelled
                && providerConversationIdPresent
            if (!providerConversationIdPresent) {
                const message = `Missing ${run.agent} conversation id in structured output`
                run.stderr += message
                run.conversation.events.push(createEvent(`${runId}-missing-conversation-id`, 'error', message, completedAt))
                emitRunEvent(run, 'error', message)
            }
            if (run.stdout.length > 0) {
                run.conversation.messages.push(createMessage(`${runId}-assistant`, 'assistant', run.stdout, completedAt, run.agent))
            }
            if (succeeded) {
                const synchronizedMessage = run.conversation.messages.at(-1)
                updateProviderSession(run, synchronizedMessage.id, completedAt)
            }
            run.conversation.completedAt = completedAt
            run.conversation.status = run.cancelled ? 'cancelled' : succeeded ? 'completed' : 'failed'
            run.conversation.events.push(createEvent(`${runId}-closed`, 'closed', String(exitCode), completedAt))
            await queueConversationPersist(run)
            this.processes.delete(runId)
            this.runningConversationIds.delete(run.conversation.id)
            emitRunEvent(run, 'closed', String(exitCode))
            if (run.onComplete) run.onComplete(succeeded ? 0 : exitCode || 1, run)
        } catch (error) {
            if (run.onCompletionError) run.onCompletionError(error)
        } finally {
            this.processes.delete(runId)
            this.runningConversationIds.delete(run.conversation.id)
        }
    }

    requireRun(runId) {
        const run = this.processes.get(runId)
        if (!run) throw new Error(`Agent run is not active: ${runId}`)

        return run
    }
}

module.exports = { AgentRunnerService }

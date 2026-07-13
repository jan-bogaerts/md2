const crypto = require('node:crypto')
const { exec } = require('node:child_process')
const { resolveAgentCommand } = require('./agent_profiles.mjs')
const { loadActionDefinitions } = require('../../../shared/action_definitions.mjs')
const { assertGitRoot, requireRootPath } = require('../git/git_commands')

const ALLOWED_REQUEST_FIELDS = new Set(['actionId', 'context', 'runInput'])
const ALLOWED_RUN_INPUT_FIELDS = new Set(['agent', 'extraPrompt', 'model', 'thinkingLevel'])
const CONTEXT_KINDS = new Set(['card', 'file', 'folder'])
const COMMIT_LINE_PATTERN = /^\[(.+?) ([0-9a-f]{7,40})\]/mu
const PLACEHOLDER_PATTERN = /\{\{\s*(rootProjectFolder|file|prompt)\s*\}\}/gu
const PROMPT_PLACEHOLDER_PATTERN = /\{\{\s*prompt\s*\}\}/u
const ROOT_COMMIT_SUFFIX = ' (root-commit)'
const COMPLETED_EXECUTION_LIMIT = 100
const REMARKABLE_CONVERT_ACTION_ID = 'md2.convert-remarkable-images-to-text'
const REMARKABLE_CONVERT_ACTION = {
    agent: null,
    appliesTo: null,
    builtin: true,
    command: null,
    description: 'Transcribe imported Remarkable images and append the text to the card.',
    icon: null,
    id: REMARKABLE_CONVERT_ACTION_ID,
    label: 'Convert Remarkable images to text',
    model: null,
    name: 'convert-remarkable-images-to-text',
    needsWorkTree: false,
    on: [],
    onAfter: [],
    onBefore: [],
    onState: null,
    prompt: 'Convert the following Remarkable images to text and append the transcription to {{file}}:\n{{prompt}}',
    sourcePath: null,
    thinkingLevel: null,
    type: 'agent',
}

class ActionCancellationError extends Error {}

function combineOutput(result) {
    return `${result.stdout}${result.stderr}`
}

function createExecutionId() {
    return `action-${crypto.randomUUID()}`
}

function errorMessage(error, fallback) {
    return error instanceof Error ? error.message : fallback
}

function throwIfCancelled(execution) {
    if (execution.controller.signal.aborted) throw new ActionCancellationError('Action cancelled')
}

function readOptionalString(value, fieldName) {
    if (value === undefined) return undefined
    if (typeof value !== 'string') throw new Error(`Invalid action run input ${fieldName}`)

    return value
}

function validateContext(context) {
    if (!context || typeof context !== 'object' || Array.isArray(context)) throw new Error('Missing action context')
    if (!CONTEXT_KINDS.has(context.kind)) throw new Error('Invalid action context kind')

    for (const [fieldName, value] of Object.entries(context)) {
        if (value !== undefined && typeof value !== 'string') throw new Error(`Invalid action context field ${fieldName}`)
    }

    return { ...context }
}

function validateRunInput(runInput = {}) {
    if (!runInput || typeof runInput !== 'object' || Array.isArray(runInput)) throw new Error('Invalid action runInput')

    const unsupportedField = Object.keys(runInput).find((fieldName) => !ALLOWED_RUN_INPUT_FIELDS.has(fieldName))
    if (unsupportedField) throw new Error(`Unsupported action runInput field: ${unsupportedField}`)

    return {
        agent: readOptionalString(runInput.agent, 'agent'),
        extraPrompt: readOptionalString(runInput.extraPrompt, 'extraPrompt') ?? '',
        model: readOptionalString(runInput.model, 'model'),
        thinkingLevel: readOptionalString(runInput.thinkingLevel, 'thinkingLevel'),
    }
}

function validateStartRequest(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Missing action start request')

    const unsupportedField = Object.keys(request).find((fieldName) => !ALLOWED_REQUEST_FIELDS.has(fieldName))
    if (unsupportedField) throw new Error(`Unsupported action start field: ${unsupportedField}`)
    if (typeof request.actionId !== 'string' || request.actionId.length === 0) throw new Error('Missing actionId')

    return { actionId: request.actionId, context: validateContext(request.context), runInput: validateRunInput(request.runInput) }
}

function resolvePlaceholders(text, context, project, extraPrompt) {
    return text.replace(PLACEHOLDER_PATTERN, (_match, name) => {
        if (name === 'rootProjectFolder') return requireRootPath(project)
        if (name === 'prompt') return extraPrompt
        if (!context.file) throw new Error('Cannot resolve file placeholder without a file context')

        return context.file
    })
}

function resolveAgentPrompt(action, context, project, extraPrompt) {
    const prompt = resolvePlaceholders(action.prompt, context, project, extraPrompt)
    if (PROMPT_PLACEHOLDER_PATTERN.test(action.prompt) || extraPrompt.trim().length === 0) return prompt

    return `${prompt}\n\n${extraPrompt}`
}

function extractCommitMetadata(input) {
    const match = COMMIT_LINE_PATTERN.exec(input.output)
    if (!match) return null

    const branch = match[1].endsWith(ROOT_COMMIT_SUFFIX) ? match[1].slice(0, -ROOT_COMMIT_SUFFIX.length) : match[1]

    return {
        actionId: input.actionId,
        branch,
        commit: match[2],
        completedAt: input.completedAt,
        filePaths: input.context.file ? [input.context.file] : [],
        repositoryRoot: requireRootPath(input.project),
    }
}

async function runCommand(project, command, signal) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)

    return new Promise((resolve, reject) => {
        exec(command, { cwd: rootPath, signal }, (error, stdout, stderr) => {
            if (signal.aborted) {
                reject(new ActionCancellationError('Action cancelled'))
                return
            }
            if (!error) {
                resolve({ command, exitCode: 0, stderr, stdout })
                return
            }

            resolve({
                command,
                exitCode: typeof error.code === 'number' ? error.code : 1,
                stderr: typeof stderr === 'string' ? stderr : '',
                stdout: typeof stdout === 'string' ? stdout : '',
            })
        })
    })
}

class ActionRunnerService {
    constructor(dependencies) {
        this.actionCompleted = dependencies?.actionCompleted ?? null
        this.actionWorktreeExecutionService = dependencies?.actionWorktreeExecutionService
        this.agentConfigProvider = dependencies?.agentConfigProvider
        this.agentRunnerService = dependencies?.agentRunnerService
        this.commandRunner = dependencies?.commandRunner ?? runCommand
        this.localGitService = dependencies?.localGitService
        this.project = null
        this.actionsFolder = null
        this.completedResults = new Map()
        this.executions = new Map()
        this.listeners = new Set()
    }

    startProject(project, actionsFolder) {
        this.project = project
        this.actionsFolder = actionsFolder
    }

    setActionCompleted(actionCompleted) {
        this.actionCompleted = actionCompleted
    }

    stop() {
        for (const executionId of this.executions.keys()) this.cancel(executionId)
        this.project = null
        this.actionsFolder = null
    }

    subscribe(listener) {
        if (typeof listener !== 'function') throw new Error('Missing action execution listener')
        this.listeners.add(listener)

        return () => this.listeners.delete(listener)
    }

    async start(request) {
        const startRequest = validateStartRequest(request)
        const action = await this.loadRootAction(startRequest.actionId)
        const executionId = createExecutionId()
        const controller = new AbortController()
        const execution = {
            activeAgentRunId: null,
            context: startRequest.context,
            controller,
            executionId,
            rootAction: action,
            runInput: startRequest.runInput,
        }
        execution.completion = this.execute(execution)
        this.executions.set(executionId, execution)

        return executionId
    }

    async wait(executionId) {
        const execution = this.executions.get(executionId)
        if (execution) return execution.completion

        const result = this.completedResults.get(executionId)
        if (!result) throw new Error(`Unknown action execution: ${executionId}`)
        this.completedResults.delete(executionId)

        return result
    }

    cancel(executionId) {
        const execution = this.requireExecution(executionId)
        execution.controller.abort()
        if (execution.activeAgentRunId) this.agentRunnerService.stop(execution.activeAgentRunId)
    }

    sendInput(executionId, input) {
        const execution = this.requireExecution(executionId)
        if (!execution.activeAgentRunId) throw new Error('Action execution has no active agent')

        this.agentRunnerService.sendInput(execution.activeAgentRunId, input)
    }

    async loadRootAction(actionId) {
        this.requireReady()
        const files = await this.localGitService.loadActionFiles(this.project, this.actionsFolder)
        const config = this.agentConfigProvider()
        const actions = loadActionDefinitions(files, { profiles: config.agentProfiles })
        const action = actionId === REMARKABLE_CONVERT_ACTION_ID
            ? REMARKABLE_CONVERT_ACTION
            : actions.find((candidate) => candidate.id === actionId)
        if (!action) throw new Error(`Unknown action: ${actionId}`)

        return action
    }

    async execute(execution) {
        const { executionId, rootAction } = execution
        this.emit(execution, rootAction, 'main', 'running', { type: 'execution' })

        let status = 'completed'
        let failure = null
        try {
            await this.runAction(execution, rootAction, 'main', true)
        } catch (error) {
            failure = error
            if (error instanceof ActionCancellationError || execution.controller.signal.aborted) status = 'cancelled'
            else status = error.phase === 'after' ? 'okButNotAfter' : 'failed'
        }

        const result = { executionId, failure: failure ? errorMessage(failure, 'Action failed') : null, status }
        this.emit(execution, rootAction, 'main', status, { message: result.failure, type: 'execution' })
        this.executions.delete(executionId)
        this.completedResults.set(executionId, result)
        if (this.completedResults.size > COMPLETED_EXECUTION_LIMIT) {
            this.completedResults.delete(this.completedResults.keys().next().value)
        }
        if (status !== 'cancelled' && this.actionCompleted) await this.actionCompleted(rootAction.id)

        return result
    }

    async runAction(execution, action, phase, isRoot = false) {
        throwIfCancelled(execution)
        for (const beforeAction of action.onBefore) await this.runAction(execution, beforeAction, 'before')

        const output = await this.runMain(execution, action, phase, isRoot)
        const matches = action.on.filter((rule) => new RegExp(rule.condition, 'u').test(output))
        for (const rule of matches) await this.runAction(execution, rule.action, 'on')

        for (const afterAction of action.onAfter) await this.runAction(execution, afterAction, 'after')

        return output
    }

    async runMain(execution, action, phase, isRoot) {
        throwIfCancelled(execution)
        this.emit(execution, action, phase, 'running', { type: 'action' })

        try {
            const result = action.type === 'agent'
                ? await this.runAgentAction(execution, action, phase, isRoot)
                : await this.runCommandAction(execution, action)
            const status = result.exitCode === 0 ? 'completed' : 'failed'
            const output = combineOutput(result)
            this.emit(execution, action, phase, status, {
                command: result.command,
                conversation: result.conversation,
                executionWorktree: result.executionWorktree,
                message: status === 'completed' ? `${action.label} completed` : `${action.label} failed with exit code ${result.exitCode}`,
                reference: result.reference,
                runId: result.runId,
                stderr: result.stderr,
                stdout: result.stdout,
                thinkingLevel: result.thinkingLevel,
                type: 'action',
            })
            if (result.exitCode !== 0) {
                const error = new Error(`${action.label} failed with exit code ${result.exitCode}`)
                error.phase = phase
                throw error
            }

            return output
        } catch (error) {
            if (error instanceof ActionCancellationError || execution.controller.signal.aborted) throw new ActionCancellationError('Action cancelled')
            if (error.phase) throw error

            error.phase = phase
            this.emit(execution, action, phase, 'failed', {
                message: errorMessage(error, `${action.label} failed`),
                stderr: errorMessage(error, `${action.label} failed`),
                stdout: '',
                type: 'action',
            })
            throw error
        }
    }

    async runCommandAction(execution, action) {
        return this.actionWorktreeExecutionService.execute(this.project, action, execution.context, async (project) => {
            const command = resolvePlaceholders(action.command, execution.context, project, execution.runInput.extraPrompt)
            const result = await this.commandRunner(project, command, execution.controller.signal)
            const executionProject = {
                ...project,
                branch: result.branch ?? project.branch,
                rootPath: result.repositoryRoot ?? project.rootPath,
            }
            await this.appendCommandHistory(action, execution.context, result, executionProject)

            return result
        })
    }

    async runAgentAction(execution, action, phase, isRoot) {
        if (!execution.context.file) throw new Error('Agent actions require a file context')

        const config = this.agentConfigProvider()
        const runInput = isRoot ? execution.runInput : {}
        const thinkingLevel = runInput.thinkingLevel ?? action.thinkingLevel
        const resolvedAgent = resolveAgentCommand(config, {
            ...(runInput.agent ? { agent: runInput.agent } : (action.agent ? { agent: action.agent } : {})),
            ...(runInput.model ? { model: runInput.model } : (action.model ? { model: action.model } : {})),
            ...(thinkingLevel ? { thinkingLevel } : {}),
        })

        return this.actionWorktreeExecutionService.execute(this.project, action, execution.context, async (project) => {
            const prompt = resolveAgentPrompt(action, execution.context, project, execution.runInput.extraPrompt)
            const request = {
                cardPath: execution.context.file,
                command: resolvedAgent.command,
                prompt,
                ...(resolvedAgent.profile.sessionIdPattern ? { sessionIdPattern: resolvedAgent.profile.sessionIdPattern } : {}),
                title: action.label,
            }
            const result = await this.runAgentProcess(execution, action, phase, project, request)
            const completedAt = new Date().toISOString()
            const executionProject = {
                ...project,
                branch: result.branch ?? project.branch,
                rootPath: result.repositoryRoot ?? project.rootPath,
            }
            const output = combineOutput(result)
            const commitInput = { actionId: action.id, completedAt, context: execution.context, output, project: executionProject }
            const commit = extractCommitMetadata(commitInput)
            const entry = {
                agent: resolvedAgent.agent,
                ...(commit ? { commit } : {}),
                completedAt,
                model: resolvedAgent.model,
                output,
                prompt: result.prompt,
                status: result.exitCode === 0 ? 'completed' : 'failed',
                thinkingLevel: resolvedAgent.thinkingLevel,
            }
            await this.appendHistory(action.id, execution.context, entry, executionProject)

            return { ...result, agent: resolvedAgent.agent, model: resolvedAgent.model, thinkingLevel: resolvedAgent.thinkingLevel }
        })
    }

    async runAgentProcess(execution, action, phase, project, request) {
        let resolveCompletion
        const completion = new Promise((resolve) => {
            resolveCompletion = resolve
        })
        const started = await this.agentRunnerService.start(
            project,
            request,
            (agentEvent) => this.emit(execution, action, phase, 'running', { agentEvent, type: 'agent' }),
            (exitCode, run) => resolveCompletion({
                command: request.command,
                conversation: { ...run.conversation, path: run.reference },
                exitCode,
                prompt: request.prompt,
                reference: run.reference,
                runId: run.conversation.id,
                stderr: run.stderr,
                stdout: run.stdout,
            }),
        )
        execution.activeAgentRunId = started.runId
        if (execution.controller.signal.aborted) this.agentRunnerService.stop(started.runId)
        const result = await completion
        execution.activeAgentRunId = null

        return result
    }

    async appendCommandHistory(action, context, result, project) {
        const completedAt = new Date().toISOString()
        const output = combineOutput(result)
        const commit = extractCommitMetadata({ actionId: action.id, completedAt, context, output, project })
        if (!commit) return

        const entry = { command: result.command, commit, completedAt, output, prompt: '', status: result.exitCode === 0 ? 'completed' : 'failed' }
        await this.appendHistory(action.id, context, entry, project)
    }

    appendHistory(actionId, context, entry, project = this.project) {
        const request = { actionId, actionsFolder: this.actionsFolder, context }

        return this.localGitService.appendActionRunHistory(project, request, entry)
    }

    emit(execution, action, phase, status, details) {
        const event = {
            actionId: action.id,
            executionId: execution.executionId,
            phase,
            rootActionId: execution.rootAction.id,
            status,
            ...details,
        }
        for (const listener of this.listeners) listener(event)
    }

    requireExecution(executionId) {
        const execution = this.executions.get(executionId)
        if (!execution) throw new Error(`Unknown action execution: ${executionId}`)

        return execution
    }

    requireReady() {
        if (!this.project) throw new Error('Action runner has no project')
        if (!this.actionsFolder) throw new Error('Action runner has no actions folder')
        if (!this.localGitService) throw new Error('Action runner has no local Git service')
        if (!this.actionWorktreeExecutionService) throw new Error('Action runner has no worktree execution service')
        if (!this.agentRunnerService) throw new Error('Action runner has no agent runner service')
        if (!this.agentConfigProvider) throw new Error('Action runner has no agent config provider')
    }
}

module.exports = { ActionRunnerService, validateStartRequest }

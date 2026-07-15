const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { buildResumeAgentCommand, resolveAgentCommand } = require('./agent_profiles.mjs')
const { resolveActionDefinition } = require('./action_definition_resolver')
const { extractCommitSummary } = require('../../../shared/action_history.mjs')
const { assertGitRoot, requireRootPath } = require('../git/git_commands')

const ALLOWED_REQUEST_FIELDS = new Set(['actionId', 'context', 'runInput'])
const ALLOWED_RUN_INPUT_FIELDS = new Set(['agent', 'continueFrom', 'extraPrompt', 'model', 'thinkingLevel'])
const CONTEXT_KINDS = new Set(['card', 'file', 'folder', 'project'])
const PLACEHOLDER_PATTERN = /\{\{\s*(rootProjectFolder|file|prompt)\s*\}\}/gu
const PROMPT_PLACEHOLDER_PATTERN = /\{\{\s*prompt\s*\}\}/u
const COMPLETED_EXECUTION_LIMIT = 100
const CONTINUE_INPUT = 'continue'
const CONTINUE_TRANSCRIPT_LIMIT = 12000
const WORKTREE_AGENT_REFERENCE_PATTERN = /^worktree:[1-9]\d*:(.*)$/u

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
        continueFrom: readOptionalString(runInput.continueFrom, 'continueFrom'),
        extraPrompt: readOptionalString(runInput.extraPrompt, 'extraPrompt') ?? '',
        model: readOptionalString(runInput.model, 'model'),
        thinkingLevel: readOptionalString(runInput.thinkingLevel, 'thinkingLevel'),
    }
}

function continuationReferencePath(reference) {
    return WORKTREE_AGENT_REFERENCE_PATTERN.exec(reference)?.[1] ?? reference
}

function buildContinuePrompt(conversation) {
    const transcript = conversation.messages.map((message, index) => {
        if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error(`Malformed agent log message: ${index}`)
        if (typeof message.role !== 'string' || typeof message.content !== 'string') throw new Error(`Malformed agent log message: ${index}`)

        return `${message.role}: ${message.content}`
    }).join('\n\n')
    const truncatedTranscript = transcript.length <= CONTINUE_TRANSCRIPT_LIMIT
        ? transcript
        : transcript.slice(transcript.length - CONTINUE_TRANSCRIPT_LIMIT)

    return ['Continue the prior agent conversation using this transcript.', '', truncatedTranscript, '', `User instruction: ${CONTINUE_INPUT}`].join('\n')
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
    const summary = extractCommitSummary(input.output)
    if (!summary) return null

    return {
        actionId: input.actionId,
        branch: summary.branch,
        commit: summary.commit,
        completedAt: input.completedAt,
        filePaths: input.context.file ? [input.context.file] : [],
        repositoryRoot: requireRootPath(input.project),
    }
}

async function runCommand(project, command, signal, onOutput) {
    const rootPath = requireRootPath(project)
    await assertGitRoot(rootPath)

    return new Promise((resolve, reject) => {
        const child = spawn(command, { cwd: rootPath, shell: true, signal })
        let stderr = ''
        let stdout = ''
        child.stdout.on('data', (chunk) => {
            const output = chunk.toString()
            stdout += output
            onOutput({ stderr: '', stdout: output })
        })
        child.stderr.on('data', (chunk) => {
            const output = chunk.toString()
            stderr += output
            onOutput({ stderr: output, stdout: '' })
        })
        child.on('error', (error) => {
            if (signal.aborted) reject(new ActionCancellationError('Action cancelled'))
            else reject(error)
        })
        child.on('close', (exitCode) => {
            if (signal.aborted) {
                reject(new ActionCancellationError('Action cancelled'))
                return
            }

            resolve({ command, exitCode: exitCode ?? 1, stderr, stdout })
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
        this.errorReporter = dependencies?.errorReporter ?? (() => undefined)
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
        this.requireReady()
        const project = { ...this.project }
        const actionsFolder = this.actionsFolder
        const action = await this.loadRootAction(startRequest.actionId, project, actionsFolder)
        const executionId = createExecutionId()
        const controller = new AbortController()
        const execution = {
            activeAgentRunId: null,
            context: startRequest.context,
            controller,
            executionId,
            actionsFolder,
            project,
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

    async loadRootAction(actionId, project, actionsFolder) {
        const config = this.agentConfigProvider()

        return resolveActionDefinition(this.localGitService, project, actionsFolder, config.agentProfiles, actionId)
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
            else status = error.rootPhase === 'after' ? 'okButNotAfter' : 'failed'
        }

        const result = { executionId, failure: failure ? errorMessage(failure, 'Action failed') : null, status }
        this.emit(execution, rootAction, 'main', status, { message: result.failure, type: 'execution' })
        this.executions.delete(executionId)
        this.completedResults.set(executionId, result)
        if (this.completedResults.size > COMPLETED_EXECUTION_LIMIT) {
            this.completedResults.delete(this.completedResults.keys().next().value)
        }
        if (status !== 'cancelled' && this.actionCompleted) {
            try {
                await this.actionCompleted(rootAction.id)
            } catch (error) {
                this.reportError(error)
            }
        }

        return result
    }

    async runAction(execution, action, phase, isRoot = false, rootPhase = phase) {
        throwIfCancelled(execution)
        for (const beforeAction of action.onBefore) {
            await this.runAction(execution, beforeAction, 'before', false, isRoot ? 'before' : rootPhase)
        }

        const output = await this.runMain(execution, action, phase, isRoot, rootPhase)
        const matches = action.on.filter((rule) => new RegExp(rule.condition, 'u').test(output))
        for (const rule of matches) await this.runAction(execution, rule.action, 'on', false, isRoot ? 'on' : rootPhase)

        for (const afterAction of action.onAfter) {
            await this.runAction(execution, afterAction, 'after', false, isRoot ? 'after' : rootPhase)
        }

        return output
    }

    async runMain(execution, action, phase, isRoot, rootPhase) {
        throwIfCancelled(execution)
        this.emit(execution, action, phase, 'running', { type: 'action' })

        try {
            const result = action.type === 'agent'
                ? await this.runAgentAction(execution, action, phase, isRoot)
                : await this.runCommandAction(execution, action, phase, isRoot)
            throwIfCancelled(execution)
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
                error.rootPhase = rootPhase
                throw error
            }

            return output
        } catch (error) {
            if (error instanceof ActionCancellationError || execution.controller.signal.aborted) {
                this.emit(execution, action, phase, 'cancelled', { message: 'Action cancelled', type: 'action' })
                throw new ActionCancellationError('Action cancelled')
            }
            if (error.phase) throw error

            error.phase = phase
            error.rootPhase = rootPhase
            this.emit(execution, action, phase, 'failed', {
                message: errorMessage(error, `${action.label} failed`),
                stderr: errorMessage(error, `${action.label} failed`),
                stdout: '',
                type: 'action',
            })
            throw error
        }
    }

    async runCommandAction(execution, action, phase, isRoot) {
        if (isRoot && execution.runInput.continueFrom) throw new Error('Conversation continuation requires an agent action')

        return this.actionWorktreeExecutionService.execute(execution.project, action, execution.context, async (project) => {
            const extraPrompt = isRoot ? execution.runInput.extraPrompt : ''
            const command = resolvePlaceholders(action.command, execution.context, project, extraPrompt)
            const onOutput = ({ stderr, stdout }) => this.emit(execution, action, phase, 'running', {
                command,
                stderr,
                stdout,
                type: 'action',
            })
            const result = await this.commandRunner(project, command, execution.controller.signal, onOutput)
            const executionProject = {
                ...project,
                branch: result.branch ?? project.branch,
                rootPath: result.repositoryRoot ?? project.rootPath,
            }
            await this.appendCommandHistory(action, execution.context, result, executionProject, execution.actionsFolder)

            return result
        })
    }

    async runAgentAction(execution, action, phase, isRoot) {
        const config = this.agentConfigProvider()
        const runInput = isRoot ? execution.runInput : {}
        const thinkingLevel = runInput.thinkingLevel ?? action.thinkingLevel
        const resolvedAgent = resolveAgentCommand(config, {
            ...(runInput.agent ? { agent: runInput.agent } : (action.agent ? { agent: action.agent } : {})),
            ...(runInput.model ? { model: runInput.model } : (action.model ? { model: action.model } : {})),
            ...(thinkingLevel ? { thinkingLevel } : {}),
        })

        return this.actionWorktreeExecutionService.execute(execution.project, action, execution.context, async (project) => {
            const extraPrompt = isRoot ? execution.runInput.extraPrompt : ''
            const continueFrom = isRoot ? execution.runInput.continueFrom : undefined
            const sourceConversation = continueFrom
                ? await this.localGitService.loadAgentConversation(project, continuationReferencePath(continueFrom))
                : null
            if (sourceConversation && sourceConversation.cardPath !== (execution.context.file ?? null)) {
                throw new Error(`Agent log belongs to ${sourceConversation.cardPath}, not ${execution.context.file}`)
            }
            const nativeResumeSessionId = sourceConversation?.nativeSessionId ?? null
            const prompt = sourceConversation
                ? nativeResumeSessionId ? CONTINUE_INPUT : buildContinuePrompt(sourceConversation)
                : resolveAgentPrompt(action, execution.context, project, extraPrompt)
            const command = nativeResumeSessionId && resolvedAgent.profile.resumeCommand
                ? buildResumeAgentCommand(resolvedAgent.profile, nativeResumeSessionId)
                : resolvedAgent.command
            const request = {
                actionId: action.id,
                ...(execution.context.file ? { cardPath: execution.context.file } : {}),
                command,
                ...(continueFrom ? { continuedFrom: continueFrom } : {}),
                ...(nativeResumeSessionId ? { nativeResumeSessionId } : {}),
                prompt,
                scopePath: execution.context.file ?? 'project',
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
            await this.appendHistory(action.id, execution.context, entry, executionProject, execution.actionsFolder)

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

    async appendCommandHistory(action, context, result, project, actionsFolder) {
        const completedAt = new Date().toISOString()
        const output = combineOutput(result)
        const commit = extractCommitMetadata({ actionId: action.id, completedAt, context, output, project })
        const entry = {
            command: result.command,
            ...(commit ? { commit } : {}),
            completedAt,
            output,
            prompt: '',
            status: result.exitCode === 0 ? 'completed' : 'failed',
        }
        await this.appendHistory(action.id, context, entry, project, actionsFolder)
    }

    appendHistory(actionId, context, entry, project, actionsFolder) {
        const request = { actionId, actionsFolder, context }

        return this.localGitService.appendActionRunHistory(project, request, entry)
    }

    emit(execution, action, phase, status, details) {
        const event = {
            actionId: action.id,
            context: execution.context,
            executionId: execution.executionId,
            phase,
            rootActionId: execution.rootAction.id,
            status,
            ...details,
        }
        for (const listener of this.listeners) {
            try {
                listener(event)
            } catch (error) {
                this.reportError(error)
            }
        }
    }

    reportError(error) {
        try {
            this.errorReporter(error)
        } catch {
            // Error reporting must not affect action execution.
        }
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

    requireActionsFolder() {
        if (!this.actionsFolder) throw new Error('Action runner has no actions folder')

        return this.actionsFolder
    }
}

module.exports = { ActionRunnerService, validateStartRequest }

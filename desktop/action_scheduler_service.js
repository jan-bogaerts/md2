const { exec } = require('node:child_process')
const { promisify } = require('node:util')
const { resolveAgentCommand, validateAgentSelection } = require('./agent_profiles')

const execAsync = promisify(exec)
const ACTION_TYPES = ['agent', 'cmd']
const CUSTOM_PROMPT_ACTION_NAME = 'custom prompt'
const DEFAULT_ACTIONS_FOLDER = 'actions'
const MAX_TIMER_DELAY_MS = 2147483647
const PLACEHOLDER_PATTERN = /\{\{\s*(rootProjectFolder|file|prompt)\s*\}\}/gu
const PROMPT_PLACEHOLDER_PATTERN = /\{\{\s*prompt\s*\}\}/u
const COMMIT_LINE_PATTERN = /^\[(.+?) ([0-9a-f]{7,40})\]/mu
const ROOT_COMMIT_SUFFIX = ' (root-commit)'

const BUILTIN_CUSTOM_PROMPT = {
    after: [],
    agent: null,
    appliesTo: null,
    before: [],
    builtin: true,
    description: 'Send a custom prompt to the agent.',
    icon: null,
    label: 'Custom prompt',
    model: null,
    name: CUSTOM_PROMPT_ACTION_NAME,
    on: [],
    onState: null,
    text: '{{prompt}}',
    type: 'agent',
}

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing action field: ${fieldName}`)

    return value
}

function requireActionType(value, name) {
    if (typeof value !== 'string' || !ACTION_TYPES.includes(value)) throw new Error(`Invalid action type for "${name}": ${String(value)}`)

    return value
}

function readAppliesTo(value, name) {
    if (value === undefined) return null
    if (!isPlainObject(value)) throw new Error(`Invalid appliesTo for "${name}"`)

    const result = {}
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry !== 'string') throw new Error(`Invalid appliesTo value for "${name}": ${key}`)
        result[key] = entry
    }

    return result
}

function readSubActionList(value, name, field) {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw new Error(`Invalid ${field} list for "${name}"`)

    return value.map((entry) => {
        if (typeof entry === 'string') return entry
        if (isPlainObject(entry)) return entry
        throw new Error(`Invalid ${field} sub-action for "${name}"`)
    })
}

function readOnRules(value, name) {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw new Error(`Invalid on list for "${name}"`)

    return value.map((entry) => {
        if (!isPlainObject(entry)) throw new Error(`Invalid on rule for "${name}"`)
        const condition = requireString(entry.condition, `on.condition for "${name}"`)
        const action = entry.action
        if (typeof action !== 'string' && !isPlainObject(action)) throw new Error(`Invalid on action for "${name}"`)

        return { action, condition }
    })
}

function validateRawDefinition(value, source) {
    if (!isPlainObject(value)) throw new Error(`Invalid action definition in ${source}`)

    const name = requireString(value.name, `name in ${source}`)
    requireString(value.label, `label for "${name}"`)
    requireString(value.description, `description for "${name}"`)
    requireActionType(value.type, name)
    requireString(value.text, `text for "${name}"`)
    if (value.icon !== undefined && typeof value.icon !== 'string') throw new Error(`Invalid icon for "${name}"`)
    if (value.onState !== undefined && typeof value.onState !== 'string') throw new Error(`Invalid onState for "${name}"`)
    if (value.agent !== undefined && typeof value.agent !== 'string') throw new Error(`Invalid agent for "${name}"`)
    if (value.model !== undefined && typeof value.model !== 'string') throw new Error(`Invalid model for "${name}"`)

    return {
        after: readSubActionList(value.after, name, 'after'),
        agent: value.agent,
        appliesTo: readAppliesTo(value.appliesTo, name) ?? undefined,
        before: readSubActionList(value.before, name, 'before'),
        description: value.description,
        icon: value.icon,
        label: value.label,
        model: value.model,
        name,
        on: readOnRules(value.on, name),
        onState: value.onState,
        text: value.text,
        type: value.type,
    }
}

function collectDefinition(value, source, registry) {
    const raw = validateRawDefinition(value, source)
    if (raw.name === CUSTOM_PROMPT_ACTION_NAME) throw new Error(`Action name "${raw.name}" is reserved for the built-in action`)
    if (registry.has(raw.name)) throw new Error(`Duplicate action name: ${raw.name}`)
    registry.set(raw.name, raw)

    for (const subAction of [...raw.before, ...raw.after]) {
        if (typeof subAction !== 'string') collectDefinition(subAction, source, registry)
    }
    for (const rule of raw.on) {
        if (typeof rule.action !== 'string') collectDefinition(rule.action, source, registry)
    }
}

function parseActionFile(file) {
    let parsed
    try {
        parsed = JSON.parse(file.content)
    } catch (error) {
        throw new Error(`Invalid action json in ${file.path}: ${error instanceof Error ? error.message : 'parse error'}`)
    }

    return Array.isArray(parsed) ? parsed : [parsed]
}

function resolveRef(subAction, resolved) {
    const name = typeof subAction === 'string' ? subAction : subAction.name
    const target = name === undefined ? undefined : resolved.get(name)
    if (!target) throw new Error(`Unknown action ref: ${String(name)}`)

    return target
}

function visitActionForCycles(action, visiting, done, trail) {
    if (done.has(action.name)) return
    if (visiting.has(action.name)) throw new Error(`Circular action reference: ${[...trail, action.name].join(' -> ')}`)

    visiting.add(action.name)
    const nextActions = [...action.before, ...action.after, ...action.on.map((rule) => rule.action)]
    for (const childAction of nextActions) visitActionForCycles(childAction, visiting, done, [...trail, action.name])
    visiting.delete(action.name)
    done.add(action.name)
}

function detectCycles(actions) {
    const visiting = new Set()
    const done = new Set()

    for (const action of actions) visitActionForCycles(action, visiting, done, [])
}

function validateAgentFields(raw, config) {
    if (raw.agent === undefined && raw.model === undefined) return
    if (!config) return

    const agent = raw.agent ?? config.agent
    validateAgentSelection(config.agentProfiles, { agent, model: raw.model ?? '' }, `action "${raw.name}"`)
}

function loadActionDefinitions(files, config = null) {
    const registry = new Map()
    for (const file of files) {
        for (const item of parseActionFile(file)) collectDefinition(item, file.path, registry)
    }
    for (const raw of registry.values()) validateAgentFields(raw, config)

    const resolved = new Map()
    resolved.set(CUSTOM_PROMPT_ACTION_NAME, BUILTIN_CUSTOM_PROMPT)

    for (const raw of registry.values()) {
        resolved.set(raw.name, {
            after: [],
            agent: raw.agent ?? null,
            appliesTo: raw.appliesTo ?? null,
            before: [],
            builtin: false,
            description: raw.description,
            icon: raw.icon ?? null,
            label: raw.label,
            model: raw.model ?? null,
            name: raw.name,
            on: [],
            onState: raw.onState ?? null,
            text: raw.text,
            type: raw.type,
        })
    }

    for (const raw of registry.values()) {
        const definition = resolved.get(raw.name)
        if (!definition) continue

        definition.before = raw.before.map((subAction) => resolveRef(subAction, resolved))
        definition.after = raw.after.map((subAction) => resolveRef(subAction, resolved))
        definition.on = raw.on.map((rule) => ({ action: resolveRef(rule.action, resolved), condition: rule.condition }))
    }

    const actions = [BUILTIN_CUSTOM_PROMPT, ...[...registry.keys()].map((name) => resolved.get(name))]
    detectCycles(actions)

    return actions
}

function combineOutput(result) {
    return `${result.stdout}${result.stderr}`
}

function statusFromExitCode(exitCode) {
    return exitCode === 0 ? 'completed' : 'failed'
}

function resolvePlaceholders(text, context, project, extraPrompt) {
    return text.replace(PLACEHOLDER_PATTERN, (_match, name) => {
        if (name === 'rootProjectFolder') return project.rootPath
        if (name === 'prompt') return extraPrompt
        if (!context.file) throw new Error('Cannot resolve file placeholder without a file context')

        return context.file
    })
}

function resolveAgentPrompt(action, context, project, extraPrompt) {
    const resolvedText = resolvePlaceholders(action.text, context, project, extraPrompt)
    if (PROMPT_PLACEHOLDER_PATTERN.test(action.text)) return resolvedText
    if (extraPrompt.trim().length === 0) return resolvedText

    return `${resolvedText}\n\n${extraPrompt}`
}

function extractCommitMetadata(input) {
    const match = COMMIT_LINE_PATTERN.exec(input.output)
    if (!match || !input.project.rootPath) return null

    const branch = match[1].endsWith(ROOT_COMMIT_SUFFIX) ? match[1].slice(0, -ROOT_COMMIT_SUFFIX.length) : match[1]
    const filePaths = input.context.file ? [input.context.file] : []

    return {
        actionName: input.actionName,
        branch,
        commit: match[2],
        completedAt: input.completedAt,
        filePaths,
        repositoryRoot: input.project.rootPath,
    }
}

function matchingOnRules(rules, output) {
    return rules.filter((rule) => new RegExp(rule.condition, 'u').test(output))
}

function createScheduleId() {
    return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createFailureEntry(message) {
    const completedAt = new Date().toISOString()

    return { completedAt, output: message, prompt: '', status: 'failed' }
}

function validateRegistrationRequest(request) {
    if (!request || typeof request !== 'object') throw new Error('Missing action schedule registration request')
    if (typeof request.actionName !== 'string' || request.actionName.length === 0) throw new Error('Missing action schedule actionName')
    if (!request.context || typeof request.context !== 'object') throw new Error('Missing action schedule context')
    if (!request.trigger || typeof request.trigger !== 'object') throw new Error('Missing action schedule trigger')

    return request
}

function requireProject(project) {
    if (!project || typeof project.rootPath !== 'string' || project.rootPath.length === 0) throw new Error('Missing scheduler project')

    return project
}

function defaultAgentCommandProvider() {
    return process.env.MD2_AGENT
}

function defaultAgentSlotCommandProvider(agentConfigProvider) {
    const config = agentConfigProvider ? agentConfigProvider() : null

    return config?.agentSlotCommand ?? ''
}

async function defaultCommandRunner(command, rootPath) {
    try {
        const { stderr, stdout } = await execAsync(command, { cwd: rootPath })

        return { command, exitCode: 0, stderr, stdout }
    } catch (error) {
        if (!error || typeof error !== 'object') throw error

        return {
            command,
            exitCode: typeof error.code === 'number' ? error.code : 1,
            stderr: typeof error.stderr === 'string' ? error.stderr : '',
            stdout: typeof error.stdout === 'string' ? error.stdout : '',
        }
    }
}

class ActionSchedulerService {
    constructor(dependencies) {
        this.agentCommandProvider = dependencies?.agentCommandProvider ?? defaultAgentCommandProvider
        this.agentConfigProvider = dependencies?.agentConfigProvider ?? null
        this.agentRunnerService = dependencies?.agentRunnerService
        this.agentSlotCommandProvider = dependencies?.agentSlotCommandProvider
            ?? (() => defaultAgentSlotCommandProvider(this.agentConfigProvider))
        this.clearTimeout = dependencies?.clearTimeout ?? clearTimeout
        this.commandRunner = dependencies?.commandRunner ?? defaultCommandRunner
        this.localGitService = dependencies?.localGitService
        this.now = dependencies?.now ?? Date.now
        this.setTimeout = dependencies?.setTimeout ?? setTimeout
        this.project = null
        this.actionsFolder = null
        this.runEventListeners = new Set()
        this.runningScheduleIds = new Set()
        this.timers = new Map()
    }

    async startProject(project) {
        this.project = requireProject(project)
        this.actionsFolder = await this.loadActionsFolder()
        await this.reconcile()
    }

    stop() {
        for (const timer of this.timers.values()) this.clearTimeout(timer)
        this.timers.clear()
        this.runningScheduleIds.clear()
        this.project = null
        this.actionsFolder = null
    }

    subscribeRunEvents(listener) {
        if (typeof listener !== 'function') throw new Error('Missing scheduler run event listener')

        this.runEventListeners.add(listener)

        return () => this.runEventListeners.delete(listener)
    }

    async registerActionSchedule(request) {
        const registration = validateRegistrationRequest(request)
        const project = this.requireCurrentProject()
        const actionsFolder = await this.requireActionsFolder()
        const schedules = await this.localGitService.loadActionSchedules(project, actionsFolder)
        const schedule = {
            actionName: registration.actionName,
            context: registration.context,
            createdAt: new Date().toISOString(),
            id: createScheduleId(),
            status: 'pending',
            trigger: registration.trigger,
        }
        const nextSchedules = [...schedules, schedule]
        await this.localGitService.saveActionSchedules(project, actionsFolder, nextSchedules)
        await this.reconcile()

        return schedule
    }

    async cancelActionSchedule(scheduleId) {
        if (typeof scheduleId !== 'string' || scheduleId.length === 0) throw new Error('Missing action schedule id')

        const timer = this.timers.get(scheduleId)
        if (timer) this.clearTimeout(timer)
        this.timers.delete(scheduleId)

        const schedules = await this.localGitService.cancelActionSchedule(
            this.requireCurrentProject(),
            await this.requireActionsFolder(),
            scheduleId,
        )
        await this.reconcile()

        return schedules
    }

    async handleProjectChange(event) {
        const actionsFolder = await this.requireActionsFolder()
        const normalizedActionsFolder = actionsFolder.replace(/\\/gu, '/').replace(/\/$/u, '')
        if (!event || event.path !== `${normalizedActionsFolder}/.md2-schedules.json`) return

        await this.reconcile()
    }

    async handleActionCompleted(actionName) {
        if (typeof actionName !== 'string' || actionName.length === 0) throw new Error('Missing completed action name')

        const schedules = await this.loadSchedulesForReconcile()
        const matchingSchedules = schedules.filter((schedule) => (
            schedule.status === 'pending'
            && schedule.trigger.type === 'afterAction'
            && schedule.trigger.actionName === actionName
        ))

        for (const schedule of matchingSchedules) await this.fireSchedule(schedule.id)
    }

    async reconcile() {
        const schedules = await this.loadSchedulesForReconcile()
        const activeScheduleIds = new Set(schedules.filter((schedule) => schedule.status === 'pending').map((schedule) => schedule.id))

        for (const [scheduleId, timer] of this.timers.entries()) {
            if (activeScheduleIds.has(scheduleId)) continue
            this.clearTimeout(timer)
            this.timers.delete(scheduleId)
        }

        for (const schedule of schedules) {
            if (schedule.status !== 'pending') continue
            if (this.timers.has(schedule.id)) continue
            await this.schedulePending(schedule)
        }
    }

    async loadSchedulesForReconcile() {
        try {
            return await this.localGitService.loadActionSchedules(this.requireCurrentProject(), await this.requireActionsFolder())
        } catch (error) {
            await this.recordSchedulerFailure(null, error instanceof Error ? error.message : 'Action schedule load failed')

            return []
        }
    }

    async schedulePending(schedule) {
        if (schedule.trigger.type === 'afterAction') return
        if (schedule.trigger.type === 'agentSlot') {
            await this.scheduleAgentSlot(schedule)
            return
        }

        if (schedule.trigger.type !== 'at') throw new Error(`Unsupported action schedule trigger: ${schedule.trigger.type}`)

        this.scheduleTimer(schedule, schedule.trigger.timestamp)
    }

    async scheduleAgentSlot(schedule) {
        const command = this.agentSlotCommandProvider()
        if (typeof command !== 'string' || command.length === 0) {
            await this.failSchedule(schedule, 'Missing desktop.agentSlotCommand for agentSlot action schedule')
            return
        }

        const result = await this.commandRunner(command, this.requireCurrentProject().rootPath)
        if (result.exitCode !== 0) {
            await this.failSchedule(schedule, `Agent slot command failed with exit code ${result.exitCode}: ${combineOutput(result)}`)
            return
        }

        const timestamp = result.stdout.trim()
        if (Number.isNaN(Date.parse(timestamp))) {
            await this.failSchedule(schedule, `Agent slot command did not output a valid timestamp: ${timestamp}`)
            return
        }

        this.scheduleTimer(schedule, timestamp)
    }

    scheduleTimer(schedule, timestamp) {
        const fireAt = Date.parse(timestamp)
        if (Number.isNaN(fireAt)) {
            void this.failSchedule(schedule, `Invalid action schedule timestamp: ${timestamp}`)
            return
        }

        const delay = Math.min(Math.max(fireAt - this.now(), 0), MAX_TIMER_DELAY_MS)
        const timer = this.setTimeout(() => {
            void this.fireSchedule(schedule.id)
        }, delay)
        this.timers.set(schedule.id, timer)
    }

    async fireSchedule(scheduleId) {
        if (this.runningScheduleIds.has(scheduleId)) return

        const timer = this.timers.get(scheduleId)
        if (timer) this.clearTimeout(timer)
        this.timers.delete(scheduleId)
        this.runningScheduleIds.add(scheduleId)

        try {
            const schedule = await this.findPendingSchedule(scheduleId)
            if (!schedule) return

            this.emitScheduleRunEvent(schedule, 'started', 'Scheduled action started')
            await this.updateScheduleStatus(scheduleId, 'running')
            await this.runScheduledAction(schedule)
            await this.updateScheduleStatus(scheduleId, 'done')
            this.emitScheduleRunEvent(schedule, 'closed', 'Scheduled action completed')
            await this.handleActionCompleted(schedule.actionName)
        } finally {
            this.runningScheduleIds.delete(scheduleId)
        }
    }

    async findPendingSchedule(scheduleId) {
        const schedules = await this.localGitService.loadActionSchedules(this.requireCurrentProject(), await this.requireActionsFolder())
        const schedule = schedules.find((candidate) => candidate.id === scheduleId)
        if (!schedule || schedule.status !== 'pending') return null

        return schedule
    }

    async failSchedule(schedule, message) {
        await this.recordSchedulerFailure(schedule, message)
        await this.updateScheduleStatus(schedule.id, 'done')
    }

    async updateScheduleStatus(scheduleId, status) {
        const project = this.requireCurrentProject()
        const actionsFolder = await this.requireActionsFolder()
        const schedules = await this.localGitService.loadActionSchedules(project, actionsFolder)
        const nextSchedules = schedules.map((schedule) => {
            if (schedule.id !== scheduleId) return schedule

            return { ...schedule, status }
        })
        await this.localGitService.saveActionSchedules(project, actionsFolder, nextSchedules)
    }

    async runScheduledAction(schedule) {
        try {
            const actions = await this.loadActions()
            const action = actions.find((candidate) => candidate.name === schedule.actionName)
            if (!action) throw new Error(`Scheduled action no longer exists: ${schedule.actionName}`)

            await this.runAction(action, schedule.context, { extraPrompt: '', stack: [] })
        } catch (error) {
            await this.recordSchedulerFailure(schedule, error instanceof Error ? error.message : 'Scheduled action failed')
        }
    }

    async loadActions() {
        const files = await this.localGitService.loadActionFiles(this.requireCurrentProject(), await this.requireActionsFolder())

        return loadActionDefinitions(files, this.agentConfigProvider ? this.agentConfigProvider() : null)
    }

    async runAction(action, context, options) {
        if (options.stack.includes(action.name)) {
            throw new Error(`Circular action call rejected: ${[...options.stack, action.name].join(' -> ')}`)
        }

        const stack = [...options.stack, action.name]
        for (const beforeAction of action.before) await this.runAction(beforeAction, context, { ...options, stack })

        const output = await this.runMain(action, context, { ...options, stack })
        await this.runOnMatches(action, context, output, { ...options, stack })

        for (const afterAction of action.after) await this.runAction(afterAction, context, { ...options, stack })
    }

    async runMain(action, context, options) {
        if (action.type === 'cmd') return this.runCommandAction(action, context, options)
        if (action.type === 'agent') return this.runAgentAction(action, context, options)

        return ''
    }

    async runCommandAction(action, context, options) {
        const project = this.requireCurrentProject()
        const command = resolvePlaceholders(action.text, context, project, options.extraPrompt)
        const result = await this.localGitService.runCommand(project, command)
        const output = combineOutput(result)
        const completedAt = new Date().toISOString()
        const commit = extractCommitMetadata({ actionName: action.name, completedAt, context, output, project })

        if (commit) {
            const entry = { command, commit, completedAt, output, prompt: '', status: statusFromExitCode(result.exitCode) }
            await this.appendHistory(action.name, context, entry)
        }

        if (result.exitCode !== 0) throw new Error(`${action.label} failed with exit code ${result.exitCode}`)

        return output
    }

    async runAgentAction(action, context, options) {
        const config = this.agentConfigProvider ? this.agentConfigProvider() : null
        const resolvedAgent = config
            ? resolveAgentCommand(config, {
                ...(action.agent ? { agent: action.agent } : {}),
                ...(action.model ? { model: action.model } : {}),
            })
            : { agent: null, command: this.agentCommandProvider(), model: '' }
        const command = resolvedAgent.command
        if (typeof command !== 'string' || command.length === 0) throw new Error('Missing desktop agent command')
        if (!context.file) throw new Error('Agent actions require a file context')
        if (!this.agentRunnerService) throw new Error('Missing agent runner service')

        const prompt = resolveAgentPrompt(action, context, this.requireCurrentProject(), options.extraPrompt)
        const request = { cardPath: context.file, command, prompt, title: action.label }
        const result = await this.agentRunnerService.run(this.requireCurrentProject(), request)
        const output = combineOutput(result)
        const completedAt = new Date().toISOString()
        const entry = {
            agent: resolvedAgent.agent,
            completedAt,
            model: resolvedAgent.model,
            output,
            prompt: result.prompt,
            status: statusFromExitCode(result.exitCode),
        }
        await this.appendHistory(action.name, context, entry)
        if (result.exitCode !== 0) throw new Error(`${action.label} failed with exit code ${result.exitCode}`)

        return output
    }

    async runOnMatches(action, context, output, options) {
        const matches = matchingOnRules(action.on, output)

        for (const rule of matches) await this.runAction(rule.action, context, { ...options, stack: options.stack })
    }

    async recordSchedulerFailure(schedule, message) {
        if (!schedule) return

        const entry = createFailureEntry(message)
        await this.appendHistory(schedule.actionName, schedule.context, entry)
    }

    async appendHistory(actionName, context, entry) {
        const request = { actionName, actionsFolder: await this.requireActionsFolder(), context }
        await this.localGitService.appendActionRunHistory(this.requireCurrentProject(), request, entry)
    }

    emitScheduleRunEvent(schedule, type, content) {
        if (this.runEventListeners.size === 0) return

        const timestamp = new Date().toISOString()
        const status = type === 'closed' ? 'completed' : 'running'
        const conversation = {
            cardPath: schedule.context.file ?? '',
            completedAt: type === 'closed' ? timestamp : null,
            events: [{ content, id: `${schedule.id}-${type}`, timestamp, type }],
            id: schedule.id,
            messages: [],
            path: '',
            startedAt: timestamp,
            status,
            title: `Scheduled ${schedule.actionName}`,
        }
        const event = { content, conversation, runId: schedule.id, type }

        for (const listener of this.runEventListeners) listener(event)
    }

    async loadActionsFolder() {
        const config = await this.localGitService.loadProjectConfig(this.requireCurrentProject())
        if (config?.actionsFolder !== undefined) {
            if (typeof config.actionsFolder !== 'string' || config.actionsFolder.length === 0) {
                throw new Error('Invalid project actionsFolder')
            }

            return config.actionsFolder
        }

        return DEFAULT_ACTIONS_FOLDER
    }

    requireCurrentProject() {
        return requireProject(this.project)
    }

    async requireActionsFolder() {
        if (this.actionsFolder) return this.actionsFolder

        this.actionsFolder = await this.loadActionsFolder()

        return this.actionsFolder
    }
}

module.exports = { ActionSchedulerService, loadActionDefinitions }

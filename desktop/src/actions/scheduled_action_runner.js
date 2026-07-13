const { resolveAgentCommand } = require('./agent_profiles.mjs')
const { loadActionDefinitions } = require('../../../shared/action_definitions.mjs')

const PLACEHOLDER_PATTERN = /\{\{\s*(rootProjectFolder|file|prompt)\s*\}\}/gu
const PROMPT_PLACEHOLDER_PATTERN = /\{\{\s*prompt\s*\}\}/u
const COMMIT_LINE_PATTERN = /^\[(.+?) ([0-9a-f]{7,40})\]/mu
const ROOT_COMMIT_SUFFIX = ' (root-commit)'

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

function resolveActionAgent(action, dependencies) {
    const config = dependencies.agentConfigProvider ? dependencies.agentConfigProvider() : null
    if (!config) return { agent: null, command: dependencies.agentCommandProvider(), model: '' }

    return resolveAgentCommand(config, {
        ...(action.agent ? { agent: action.agent } : {}),
        ...(action.model ? { model: action.model } : {}),
    })
}

async function loadActions(dependencies) {
    const files = await dependencies.localGitService.loadActionFiles(dependencies.project, dependencies.actionsFolder)
    const config = dependencies.agentConfigProvider ? dependencies.agentConfigProvider() : null

    return loadActionDefinitions(files, config)
}

async function runCommandAction(action, context, options, dependencies) {
    if (!dependencies.actionWorktreeExecutionService) throw new Error('Missing action worktree execution service')
    const result = await dependencies.actionWorktreeExecutionService.execute(
        dependencies.project,
        action,
        context,
        (project) => {
            const command = resolvePlaceholders(action.text, context, project, options.extraPrompt)

            return dependencies.localGitService.runCommand(project, command)
        },
    )
    const output = combineOutput(result)
    const completedAt = new Date().toISOString()
    const executionProject = { ...dependencies.project, branch: result.branch, rootPath: result.repositoryRoot }
    const commit = extractCommitMetadata({ actionName: action.name, completedAt, context, output, project: executionProject })

    if (commit) {
        const entry = { command: result.command, commit, completedAt, output, prompt: '', status: statusFromExitCode(result.exitCode) }
        await dependencies.appendHistory(action.name, context, entry, executionProject)
    }

    if (result.exitCode !== 0) throw new Error(`${action.label} failed with exit code ${result.exitCode}`)

    return output
}

async function runAgentAction(action, context, options, dependencies) {
    const resolvedAgent = resolveActionAgent(action, dependencies)
    const command = resolvedAgent.command
    if (typeof command !== 'string' || command.length === 0) throw new Error('Missing desktop agent command')
    if (!context.file) throw new Error('Agent actions require a file context')
    if (!dependencies.agentRunnerService) throw new Error('Missing agent runner service')

    if (!dependencies.actionWorktreeExecutionService) throw new Error('Missing action worktree execution service')
    const result = await dependencies.actionWorktreeExecutionService.execute(
        dependencies.project,
        action,
        context,
        (project) => {
            const prompt = resolveAgentPrompt(action, context, project, options.extraPrompt)
            const request = { cardPath: context.file, command, prompt, title: action.label }

            return dependencies.agentRunnerService.run(project, request)
        },
    )
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
    const executionProject = { ...dependencies.project, branch: result.branch, rootPath: result.repositoryRoot }
    await dependencies.appendHistory(action.name, context, entry, executionProject)
    if (result.exitCode !== 0) throw new Error(`${action.label} failed with exit code ${result.exitCode}`)

    return output
}

async function runMain(action, context, options, dependencies) {
    if (action.type === 'cmd') return runCommandAction(action, context, options, dependencies)
    if (action.type === 'agent') return runAgentAction(action, context, options, dependencies)

    return ''
}

async function runAction(action, context, options, dependencies) {
    if (options.stack.includes(action.name)) throw new Error(`Circular action call rejected: ${[...options.stack, action.name].join(' -> ')}`)

    const stack = [...options.stack, action.name]
    for (const beforeAction of action.before) await runAction(beforeAction, context, { ...options, stack }, dependencies)

    const output = await runMain(action, context, { ...options, stack }, dependencies)
    const matches = matchingOnRules(action.on, output)
    for (const rule of matches) await runAction(rule.action, context, { ...options, stack }, dependencies)

    for (const afterAction of action.after) await runAction(afterAction, context, { ...options, stack }, dependencies)
}

async function runScheduledAction(schedule, dependencies) {
    const actions = await loadActions(dependencies)
    const action = actions.find((candidate) => candidate.name === schedule.actionName)
    if (!action) throw new Error(`Scheduled action no longer exists: ${schedule.actionName}`)

    await runAction(action, schedule.context, { extraPrompt: '', stack: [] }, dependencies)
}

module.exports = { runScheduledAction }

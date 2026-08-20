export const AGENT_TOKEN_USAGE_SCHEMA_VERSION = 1
export const AGENT_TOKEN_USAGE_FILE_NAME = 'agent_token_usage.json'

function requireUsageNumber(value, fieldName) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`Malformed agent token usage summary: invalid ${fieldName}`)
    }

    return value
}

export function emptySummaryUsage() {
    return {
        cachedInputTokens: 0,
        inputTokens: 0,
        legacyTotalTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
    }
}

export function legacySummaryUsage(totalTokens, costUsd) {
    const usage = { ...emptySummaryUsage(), legacyTotalTokens: totalTokens, totalTokens }
    if (costUsd !== undefined) usage.costUsd = costUsd

    return parseSummaryUsage(usage, 'legacy usage')
}

export function correctedSummaryUsage(usage) {
    return parseSummaryUsage({ ...usage, legacyTotalTokens: 0 }, 'corrected usage')
}

export function addSummaryUsage(usages) {
    const total = emptySummaryUsage()
    let hasCost = false
    for (const usage of usages) {
        total.cachedInputTokens += usage.cachedInputTokens
        total.inputTokens += usage.inputTokens
        total.legacyTotalTokens += usage.legacyTotalTokens
        total.outputTokens += usage.outputTokens
        total.reasoningTokens += usage.reasoningTokens
        if (usage.costUsd !== undefined) {
            total.costUsd = (total.costUsd ?? 0) + usage.costUsd
            hasCost = true
        }
    }
    total.totalTokens = total.legacyTotalTokens
        + total.inputTokens
        + total.cachedInputTokens
        + total.outputTokens
        + total.reasoningTokens
    if (!hasCost) delete total.costUsd

    return total
}

export function createAgentTokenUsageSummary(projectUsage = emptySummaryUsage(), releases = {}) {
    return { projectUsage, releases, schemaVersion: AGENT_TOKEN_USAGE_SCHEMA_VERSION }
}

export function agentTokenUsageFilePath(projectFolder) {
    if (typeof projectFolder !== 'string') throw new Error('Missing agent token usage projectFolder')
    const normalizedProjectFolder = projectFolder.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')

    return normalizedProjectFolder.length > 0
        ? `${normalizedProjectFolder}/${AGENT_TOKEN_USAGE_FILE_NAME}`
        : AGENT_TOKEN_USAGE_FILE_NAME
}

export function parseSummaryUsage(value, fieldName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Malformed agent token usage summary: invalid ${fieldName}`)
    }
    const allowedFields = new Set([
        'cachedInputTokens', 'costUsd', 'inputTokens', 'legacyTotalTokens',
        'outputTokens', 'reasoningTokens', 'totalTokens',
    ])
    const unknownField = Object.keys(value).find((name) => !allowedFields.has(name))
    if (unknownField) throw new Error(`Malformed agent token usage summary: unexpected ${fieldName}.${unknownField}`)
    const usage = {
        cachedInputTokens: requireUsageNumber(value.cachedInputTokens, `${fieldName}.cachedInputTokens`),
        inputTokens: requireUsageNumber(value.inputTokens, `${fieldName}.inputTokens`),
        legacyTotalTokens: requireUsageNumber(value.legacyTotalTokens, `${fieldName}.legacyTotalTokens`),
        outputTokens: requireUsageNumber(value.outputTokens, `${fieldName}.outputTokens`),
        reasoningTokens: requireUsageNumber(value.reasoningTokens, `${fieldName}.reasoningTokens`),
        totalTokens: requireUsageNumber(value.totalTokens, `${fieldName}.totalTokens`),
    }
    const expectedTotal = usage.legacyTotalTokens
        + usage.inputTokens
        + usage.cachedInputTokens
        + usage.outputTokens
        + usage.reasoningTokens
    if (usage.totalTokens !== expectedTotal) {
        throw new Error(`Malformed agent token usage summary: inconsistent ${fieldName}.totalTokens`)
    }
    if (value.costUsd !== undefined) usage.costUsd = requireUsageNumber(value.costUsd, `${fieldName}.costUsd`)

    return usage
}

export function parseAgentTokenUsageSummary(content) {
    let value
    try {
        value = JSON.parse(content)
    } catch (error) {
        throw new Error('Malformed agent token usage summary: invalid JSON', { cause: error })
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Malformed agent token usage summary: root must be an object')
    }
    const allowedRootFields = new Set(['projectUsage', 'releases', 'schemaVersion'])
    const unknownRootField = Object.keys(value).find((name) => !allowedRootFields.has(name))
    if (unknownRootField) throw new Error(`Malformed agent token usage summary: unexpected ${unknownRootField}`)
    if (value.schemaVersion !== AGENT_TOKEN_USAGE_SCHEMA_VERSION) {
        throw new Error(`Malformed agent token usage summary: unsupported schemaVersion ${String(value.schemaVersion)}`)
    }
    if (!value.releases || typeof value.releases !== 'object' || Array.isArray(value.releases)) {
        throw new Error('Malformed agent token usage summary: invalid releases')
    }
    const releases = Object.fromEntries(Object.entries(value.releases).map(([name, usage]) => {
        if (name.length === 0) throw new Error('Malformed agent token usage summary: empty release name')

        return [name, parseSummaryUsage(usage, `releases.${name}`)]
    }))

    return {
        projectUsage: parseSummaryUsage(value.projectUsage, 'projectUsage'),
        releases,
        schemaVersion: AGENT_TOKEN_USAGE_SCHEMA_VERSION,
    }
}

export function serializeAgentTokenUsageSummary(summary) {
    const parsed = parseAgentTokenUsageSummary(JSON.stringify(summary))

    return `${JSON.stringify(parsed, null, 2)}\n`
}

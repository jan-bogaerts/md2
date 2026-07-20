const JSON_EXTENSION_PATTERN = /\.[^./\\]+$/u
const ACTIVITY_ID_PATTERN = /^[a-zA-Z0-9._-]+$/u

function normalizeFolderPath(folderPath) {
    return folderPath.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
}

export function normalizeLogFileValue(value) {
    if (typeof value !== 'string' || value.length === 0) throw new Error('Missing log filename value')

    const normalized = value.toLowerCase().replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '')
    if (normalized.length === 0) throw new Error(`Log filename value has no letters or digits: ${value}`)

    return normalized
}

function requireActivityId(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing ${fieldName}`)
    if (!ACTIVITY_ID_PATTERN.test(value) || value === '.' || value === '..') throw new Error(`Invalid ${fieldName}: ${value}`)

    return value
}

export function projectActivityFolder(projectFolder) {
    if (typeof projectFolder !== 'string') throw new Error('Missing projectFolder')
    const normalizedProjectFolder = normalizeFolderPath(projectFolder)

    return normalizedProjectFolder.length > 0 ? `${normalizedProjectFolder}/activity` : 'activity'
}

export function cardActivityFileName(cardInternalId) {
    return `card__${requireActivityId(cardInternalId, 'cardInternalId')}.json`
}

export function projectActivityFileName() {
    return 'project.json'
}

export function activityFilePath(projectFolder, origin) {
    if (!origin || typeof origin !== 'object') throw new Error('Missing activity origin')
    const fileName = origin.kind === 'card'
        ? cardActivityFileName(origin.cardInternalId)
        : origin.kind === 'project' ? projectActivityFileName() : null
    if (!fileName) throw new Error(`Invalid activity origin kind: ${String(origin.kind)}`)

    return `${projectActivityFolder(projectFolder)}/${fileName}`
}

export function conversationActivityReference(activityPath, conversationId) {
    if (typeof activityPath !== 'string' || activityPath.length === 0) throw new Error('Missing activity path')
    const id = requireActivityId(conversationId, 'conversationId')

    return `${activityPath}#conversation=${id}`
}

export function parseConversationActivityReference(reference) {
    if (typeof reference !== 'string' || reference.length === 0) throw new Error('Missing conversation activity reference')
    const marker = '#conversation='
    const markerIndex = reference.lastIndexOf(marker)
    if (markerIndex <= 0) throw new Error(`Invalid conversation activity reference: ${reference}`)
    const activityPath = reference.slice(0, markerIndex)
    const conversationId = requireActivityId(reference.slice(markerIndex + marker.length), 'conversationId')

    return { activityPath, conversationId }
}

export function projectLogFolder(projectFolder) {
    if (typeof projectFolder !== 'string') throw new Error('Missing projectFolder')
    const normalizedProjectFolder = normalizeFolderPath(projectFolder)

    return normalizedProjectFolder.length > 0 ? `${normalizedProjectFolder}/logs` : 'logs'
}

export function logScopeValue(scopePath, projectFolder) {
    if (typeof scopePath !== 'string' || scopePath.length === 0) throw new Error('Missing log scope path')
    if (typeof projectFolder !== 'string') throw new Error('Missing projectFolder')
    const normalizedScopePath = normalizeFolderPath(scopePath)
    const normalizedProjectFolder = normalizeFolderPath(projectFolder)
    const projectPrefix = normalizedProjectFolder.length > 0 ? `${normalizedProjectFolder}/` : ''
    const relativeScope = projectPrefix.length > 0 && normalizedScopePath.startsWith(projectPrefix)
        ? normalizedScopePath.slice(projectPrefix.length)
        : normalizedScopePath
    const extensionlessScope = relativeScope.replace(JSON_EXTENSION_PATTERN, '')

    return normalizeLogFileValue(extensionlessScope)
}

export function conversationLogFileName(scopePath, conversationId, projectFolder) {
    const normalizedConversationId = normalizeLogFileValue(conversationId)
    if (scopePath === 'project') return `conversation__project__${normalizedConversationId}.json`

    return `conversation__card__${logScopeValue(scopePath, projectFolder)}__${normalizedConversationId}.json`
}

export function historyLogFileName(context, actionId, projectFolder) {
    if (!context || typeof context !== 'object') throw new Error('Missing action history context')
    const normalizedActionId = normalizeLogFileValue(actionId)
    const scopePath = typeof context.file === 'string' && context.file.length > 0
        ? context.file
        : typeof context.folder === 'string' && context.folder.length > 0 ? context.folder : null
    if (!scopePath) return `history__project__${normalizedActionId}.json`

    return `history__card__${logScopeValue(scopePath, projectFolder)}__${normalizedActionId}.json`
}

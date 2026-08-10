const ACTIVITY_ID_PATTERN = /^[a-zA-Z0-9._-]+$/u

function normalizeFolderPath(folderPath) {
    return folderPath.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
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

/** Derive canonical activity ownership from a recognized activity filename. */
export function activityOriginFromPath(activityPath) {
    if (typeof activityPath !== 'string' || activityPath.length === 0) return null
    const fileName = activityPath.replace(/\\/gu, '/').split('/').pop()
    if (fileName === projectActivityFileName()) return { kind: 'project' }
    const match = /^card__(.+)\.json$/u.exec(fileName ?? '')
    if (!match || !ACTIVITY_ID_PATTERN.test(match[1]) || match[1] === '.' || match[1] === '..') return null

    return { cardInternalId: match[1], kind: 'card' }
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

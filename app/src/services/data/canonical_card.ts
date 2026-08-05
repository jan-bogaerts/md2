import type { CanonicalCard } from '../../data/data_types'

const TITLE_PREFIX = '# '

function nullableValue(value: string) {
    return value.length > 0 ? value : null
}

function setKnownStringField(card: CanonicalCard, key: string, value: string) {
    switch (key) {
        case 'after': card.header.after = nullableValue(value); break
        case 'author': card.header.author = nullableValue(value); break
        case 'id': card.header.id = value; break
        case 'internalId': card.header.internalId = nullableValue(value); break
        case 'owner': card.header.owner = nullableValue(value); break
        case 'status': card.header.status = nullableValue(value); break
        case 'title': card.header.title = value; break
        default: break
    }
}

/** Mutates scalar frontmatter fields while keeping parsed header values synchronized. */
export function setCardHeaderFields(card: CanonicalCard, updates: Record<string, string>) {
    for (const [key, value] of Object.entries(updates)) {
        card.headerFields[key] = value
        setKnownStringField(card, key, value)
    }
}

export function setCardBody(card: CanonicalCard, body: string) {
    card.content = body
}

export function setCardTitle(card: CanonicalCard, title: string) {
    setCardHeaderFields(card, { title })
    card.content = card.content.replace(/^# .*$/m, `${TITLE_PREFIX}${title}`)
}

export function setCardAffects(card: CanonicalCard, affects: string[]) {
    card.header.affects = [...affects]
    card.headerFields.affects = [...affects]
}

export function setCardAgentLogReferences(card: CanonicalCard, references: string[]) {
    card.header.agentLogReferences = [...references]
    card.headerFields.agents = [...references]
}

export function toggleCardPolicy(card: CanonicalCard, policyKey: string) {
    const enabled = !(card.header.policy[policyKey] ?? false)
    card.header.policy = { ...card.header.policy, [policyKey]: enabled }
    const currentPolicy = card.headerFields.policy
    const policy = currentPolicy && typeof currentPolicy === 'object' && !Array.isArray(currentPolicy)
        ? currentPolicy
        : {}
    card.headerFields.policy = { ...policy, [policyKey]: enabled ? 'true' : 'false' }
}

export function setCardWorktree(card: CanonicalCard, worktree: number | null) {
    if (worktree !== null && (!Number.isSafeInteger(worktree) || worktree <= 0)) {
        throw new Error(`Invalid card worktree index: ${worktree}`)
    }

    card.header.worktree = worktree
    card.header.worktreeError = null
    card.header.worktreeValue = worktree === null ? null : String(worktree)
    if (worktree === null) delete card.headerFields.worktree
    else card.headerFields.worktree = String(worktree)
}

import type { Card } from '../../data/data_types'

const TITLE_PREFIX = '# '

function nullableValue(value: string) {
    return value.length > 0 ? value : null
}

function setKnownStringField(card: Card, key: string, value: string) {
    switch (key) {
        case 'after': card.header.after = nullableValue(value); break
        case 'author': card.header.author = nullableValue(value); break
        case 'branch': card.header.branch = nullableValue(value); break
        case 'id': card.header.id = value; break
        case 'internalId': card.header.internalId = nullableValue(value); break
        case 'owner': card.header.owner = nullableValue(value); break
        case 'status': card.header.status = nullableValue(value); break
        case 'title': card.header.title = value; break
        default: break
    }
}

/** Mutates scalar frontmatter fields while keeping parsed header values synchronized. */
export function setCardHeaderFields(card: Card, updates: Record<string, string>) {
    for (const [key, value] of Object.entries(updates)) {
        setKnownStringField(card, key, value)
    }
}

export function setCardBody(card: Card, body: string) {
    card.content = body
}

export function setCardTitle(card: Card, title: string) {
    setCardHeaderFields(card, { title })
    card.content = card.content.replace(/^# .*$/m, `${TITLE_PREFIX}${title}`)
}

export function setCardAffects(card: Card, affects: string[]) {
    card.header.affects = [...affects]
}

export function setCardAgentLogReferences(card: Card, references: string[]) {
    card.header.agentLogReferences = [...references]
}

export function setCardReferences(card: Card, references: string[]) {
    card.header.references = [...new Set(references)]
}

export function toggleCardPolicy(card: Card, policyKey: string) {
    const enabled = !(card.header.policy[policyKey] ?? false)
    card.header.policy = { ...card.header.policy, [policyKey]: enabled }
}

export function setCardWorktree(card: Card, worktree: number | null) {
    if (worktree !== null && (!Number.isSafeInteger(worktree) || worktree <= 0)) {
        throw new Error(`Invalid card worktree index: ${worktree}`)
    }

    card.header.worktree = worktree
    card.header.worktreeError = null
    card.header.worktreeValue = worktree === null ? null : String(worktree)
}

export function setCardWorktreeAssignment(card: Card, worktree: number, branch: string) {
    if (branch.length === 0) throw new Error('Missing card branch name')

    setCardWorktree(card, worktree)
    card.header.branch = branch
}

export function clearCardBranch(card: Card) {
    card.header.branch = null
}

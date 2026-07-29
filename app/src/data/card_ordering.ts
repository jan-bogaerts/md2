import { DEFAULT_STATES, defaultColumnAccent, type ProjectCard, type StateConfig } from './data_types'

/** A status column with its cards already ordered by the `after` chain. */
export interface CardColumn {
    cards: ProjectCard[]
    status: string
}

/** Board column with its resolved configured accent. */
export interface BoardColumn extends CardColumn {
    color: string
}

/** A minimal header change produced by a drag: the fields a move rewrites. */
export interface CardMoveUpdate {
    after: string | null
    path: string
    status: string
}

/** Cards with a null/empty status share this column key so grouping stays total. */
export const UNASSIGNED_STATUS = ''

/** A card's column key, mapping a missing status onto the unassigned column. */
export function statusOf(card: ProjectCard) {
    return card.header.status ?? UNASSIGNED_STATUS
}

/**
 * Order a single column's cards by the `after` chain, where a card's `after`
 * holds the `internalId` of the card that precedes it. Cards whose `after` is
 * empty or points outside the set are treated as heads (kept in input order),
 * and any cards left over by cycles or duplicate links are appended stably.
 */
export function orderByAfter(cards: ProjectCard[]): ProjectCard[] {
    const byInternalId = new Map<string, ProjectCard>()
    for (const card of cards) {
        if (card.header.internalId) byInternalId.set(card.header.internalId, card)
    }

    const followerOf = new Map<string, ProjectCard>()
    const heads: ProjectCard[] = []
    for (const card of cards) {
        const after = card.header.after
        if (after && byInternalId.has(after) && !followerOf.has(after)) {
            followerOf.set(after, card)
        } else {
            heads.push(card)
        }
    }

    const ordered: ProjectCard[] = []
    const visited = new Set<ProjectCard>()
    for (const head of heads) {
        let current: ProjectCard | undefined = head
        while (current && !visited.has(current)) {
            ordered.push(current)
            visited.add(current)
            current = current.header.internalId ? followerOf.get(current.header.internalId) : undefined
        }
    }
    for (const card of cards) {
        if (!visited.has(card)) ordered.push(card)
    }

    return ordered
}

/** Group cards into columns by distinct status, preserving first-seen order. */
export function groupByStatus(cards: ProjectCard[]): CardColumn[] {
    const order: string[] = []
    const buckets = new Map<string, ProjectCard[]>()

    for (const card of cards) {
        const status = statusOf(card)
        const bucket = buckets.get(status)
        if (bucket) {
            bucket.push(card)
        } else {
            buckets.set(status, [card])
            order.push(status)
        }
    }

    return order.map((status) => ({ cards: orderByAfter(buckets.get(status) ?? []), status }))
}

/** Build board columns in configured state order, omitting empty states unless they are always visible. */
export function buildCardColumns(cards: ProjectCard[], states: StateConfig[]): BoardColumn[] {
    return states
        .map(({ color, state }, index) => ({
            cards: orderByAfter(cards.filter((card) => statusOf(card) === state)),
            color: color ?? defaultColumnAccent(index),
            status: state,
        }))
        .filter((column, index) => states[index].alwaysVisible || column.cards.length > 0)
}

/** Derive state definitions from the distinct non-empty card states in first-seen order. */
export function deriveStatesFromCards(cards: ProjectCard[]): StateConfig[] {
    const states = cards
        .map((card) => statusOf(card))
        .filter((state, index, values) => state.length > 0 && values.indexOf(state) === index)

    return states.map((state, index) => ({ alwaysVisible: false, color: defaultColumnAccent(index), state }))
}

/** Keep discovered state order and append missing default state definitions. */
export function mergeStatesWithDefaults(states: StateConfig[]): StateConfig[] {
    const defaultsByState = new Map(DEFAULT_STATES.map((stateConfig) => [stateConfig.state, stateConfig]))
    const mergedStates = states.map((stateConfig, index) => defaultsByState.get(stateConfig.state) ?? {
        ...stateConfig,
        color: stateConfig.color ?? defaultColumnAccent(index),
    })
    const mergedStateNames = new Set(mergedStates.map(({ state }) => state))

    return [...mergedStates, ...DEFAULT_STATES.filter(({ state }) => !mergedStateNames.has(state))]
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max)
}

/**
 * Compute the minimal set of header changes to move `cardPath` into
 * `targetStatus` at `targetIndex`. At most three cards change: the moved card
 * (new `status` + `after`), the card that now follows it in the target column,
 * and the card that used to follow it in the source column. No-op moves and
 * links whose values are unchanged are filtered out so only affected cards are
 * written.
 */
export function computeMove(
    cards: ProjectCard[],
    cardPath: string,
    targetStatus: string,
    targetIndex: number,
): CardMoveUpdate[] {
    const moved = cards.find((card) => card.path === cardPath)
    if (!moved) return []

    const movedInternalId = moved.header.internalId
    const updates = new Map<string, CardMoveUpdate>()

    const sourceStatus = statusOf(moved)
    const sourceOrdered = orderByAfter(cards.filter((card) => statusOf(card) === sourceStatus))
    const movedPosition = sourceOrdered.findIndex((card) => card.path === cardPath)
    const oldFollower = sourceOrdered[movedPosition + 1]

    const targetOrdered = orderByAfter(
        cards.filter((card) => statusOf(card) === targetStatus && card.path !== cardPath),
    )
    const insertIndex = clamp(targetIndex, 0, targetOrdered.length)
    const newPredecessor = targetOrdered[insertIndex - 1] ?? null
    const newFollower = targetOrdered[insertIndex] ?? null

    updates.set(cardPath, { after: newPredecessor?.header.internalId ?? null, path: cardPath, status: targetStatus })

    if (newFollower && movedInternalId) {
        updates.set(newFollower.path, { after: movedInternalId, path: newFollower.path, status: targetStatus })
    }

    if (oldFollower && !updates.has(oldFollower.path)) {
        updates.set(oldFollower.path, { after: moved.header.after, path: oldFollower.path, status: sourceStatus })
    }

    const byPath = new Map(cards.map((card) => [card.path, card]))

    return [...updates.values()].filter((update) => {
        const card = byPath.get(update.path)
        if (!card) return true

        return card.header.after !== update.after || statusOf(card) !== update.status
    })
}

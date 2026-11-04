import type { ActionDefinition } from '../../data/action_types'
import type { AnySchedule } from '../../data/action_schedule_types'
import type { Card } from '../../data/data_types'
import type { ClaudeRateLimitSnapshot } from '../../data/electron_claude_runtime_bridge'
import type { CodexRateLimitSnapshot } from '../../data/electron_codex_runtime_bridge'
import { initialAgentAccountId, resolveAgentAccount, type AgentAccount } from '../../data/agent_accounts'

export interface ActiveScheduleReference {
    available: boolean
    id: string
    label: string
    path: string | null
}

export interface ActiveScheduleTrackerReference {
    available: boolean
    label: string
}

export interface ActiveScheduleItem {
    actionAvailable: boolean
    actionLabel: string
    schedule: AnySchedule
    target: ActiveScheduleReference | null
    tracker: ActiveScheduleTrackerReference | null
    triggerCard: ActiveScheduleReference | null
    unavailableReasons: string[]
}

export interface ActiveScheduleProjectionSources {
    actions: ActionDefinition[]
    agentAccounts: AgentAccount[]
    cards: Card[]
    claudeSnapshots: ReadonlyMap<string, ClaudeRateLimitSnapshot | null>
    codexSnapshots: ReadonlyMap<string, CodexRateLimitSnapshot | null>
    defaultAccountId(agent: string): string
}

function cardReference(cardInternalId: string, cards: Card[]): ActiveScheduleReference {
    const card = cards.find(({ header }) => header.internalId === cardInternalId)
    if (!card) return { available: false, id: cardInternalId, label: cardInternalId, path: null }

    return {
        available: true,
        id: cardInternalId,
        label: `${card.header.id} — ${card.header.title}`,
        path: card.path,
    }
}

function trackerReference(
    schedule: AnySchedule,
    sources: ActiveScheduleProjectionSources,
): ActiveScheduleTrackerReference | null {
    if (schedule.trigger.type !== 'account-reset') return null
    const { agent, limitId, windowId } = schedule.trigger
    const requestedAccountId = schedule.trigger.accountId
    let account: AgentAccount | null = null
    try {
        account = resolveAgentAccount(
            sources.agentAccounts,
            agent,
            requestedAccountId,
            requestedAccountId === undefined ? undefined : sources.defaultAccountId(agent),
        )
    } catch {
        // Invalid cross-agent references remain unavailable instead of breaking the schedules view.
    }
    const accountId = account?.id ?? requestedAccountId ?? initialAgentAccountId(agent)
    const accountLabel = account?.name ?? accountId
    if (!account) return { available: false, label: `${agent} / ${accountLabel} / ${limitId} / ${windowId}` }
    if (agent === 'claude') {
        const claudeSnapshot = sources.claudeSnapshots.get(accountId) ?? null
        const window = claudeSnapshot?.available && limitId === 'default'
            ? claudeSnapshot.windows.find(({ id }) => id === windowId)
            : null

        return { available: !!window, label: `Claude / ${accountLabel} / ${limitId} / ${windowId}` }
    }
    if (agent === 'codex') {
        const codexSnapshot = sources.codexSnapshots.get(accountId) ?? null
        const bucket = codexSnapshot?.available
            ? codexSnapshot.buckets.find((candidate) => candidate.limitId === limitId)
            : null
        const window = windowId === 'primary' || windowId === 'secondary' ? bucket?.[windowId] : null
        const limitLabel = bucket?.limitName ?? limitId

        return { available: !!window, label: `Codex / ${accountLabel} / ${limitLabel} / ${windowId}` }
    }

    return { available: false, label: `${agent} / ${accountLabel} / ${limitId} / ${windowId}` }
}

/** Builds renderer-only labels and availability from backend-owned schedule records. */
export function projectActiveSchedules(
    schedules: readonly AnySchedule[],
    sources: ActiveScheduleProjectionSources,
): ActiveScheduleItem[] {
    const { actions, cards } = sources

    return schedules.map((schedule) => {
        const action = actions.find(({ id }) => id === schedule.actionId)
        const targetCardInternalId = schedule.kind === 'action'
            ? schedule.context.cardInternalId ?? null
            : schedule.cardInternalIds[schedule.currentIndex]
        const target = targetCardInternalId ? cardReference(targetCardInternalId, cards) : null
        const triggerCard = schedule.trigger.type === 'card-state'
            ? cardReference(schedule.trigger.cardInternalId, cards)
            : null
        const tracker = trackerReference(schedule, sources)
        const unavailableReasons: string[] = []
        if (!action) unavailableReasons.push(`Action unavailable: ${schedule.actionId}`)
        if (target && !target.available) unavailableReasons.push(`Target card unavailable: ${target.id}`)
        if (triggerCard && !triggerCard.available) unavailableReasons.push(`Trigger card unavailable: ${triggerCard.id}`)
        if (tracker && !tracker.available) unavailableReasons.push(`Account tracker unavailable: ${tracker.label}`)

        return {
            actionAvailable: !!action,
            actionLabel: action?.label ?? schedule.actionId,
            schedule,
            target,
            tracker,
            triggerCard,
            unavailableReasons,
        }
    })
}

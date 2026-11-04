import type { Card, StateConfig } from '../../../../data/data_types'
import type { ClaudeRateLimitState } from '../../../../services/agents/claude_rate_limit_service'
import type { CodexRateLimitState } from '../../../../services/agents/codex_rate_limit_service'
import type { AgentAccount } from '../../../../data/agent_accounts'

const UNIX_MILLISECONDS_THRESHOLD = 1_000_000_000_000

export interface ActionScheduleAccountTracker {
    accountId: string
    accountName: string
    agent: 'claude' | 'codex'
    agentLabel: string
    expectedResetAt: string | null
    label: string
    limitId: string
    usedPercent: number
    windowId: string
}

export interface ActionScheduleCardOption {
    cardInternalId: string
    label: string
    registrationState: string | null
}

function resetTimestamp(agent: ActionScheduleAccountTracker['agent'], resetsAt: number | null) {
    if (resetsAt === null || !Number.isFinite(resetsAt)) return null
    const milliseconds = agent === 'codex' && resetsAt < UNIX_MILLISECONDS_THRESHOLD ? resetsAt * 1000 : resetsAt

    return new Date(milliseconds).toISOString()
}

/** Projects live provider snapshots into exact selectable account limit windows. */
export function accountTrackerOptions(
    claudeAccount: AgentAccount | null,
    claudeState: ClaudeRateLimitState,
    codexAccount: AgentAccount | null,
    codexState: CodexRateLimitState,
): ActionScheduleAccountTracker[] {
    const trackers: ActionScheduleAccountTracker[] = []
    const claudeSnapshot = claudeState.snapshot
    if (claudeAccount && !claudeState.stale && claudeState.receivedAt !== null && claudeSnapshot?.available) {
        trackers.push(...claudeSnapshot.windows.map((window) => ({
            accountId: claudeAccount.id,
            accountName: claudeAccount.name,
            agent: 'claude' as const,
            agentLabel: 'Claude',
            expectedResetAt: resetTimestamp('claude', window.resetsAt),
            label: `${window.id} · ${Math.round(window.usedPercent)}% used`,
            limitId: 'default',
            usedPercent: window.usedPercent,
            windowId: window.id,
        })))
    }

    const codexSnapshot = codexState.snapshot
    if (codexAccount && !codexState.stale && codexState.receivedAt !== null && codexSnapshot?.available) {
        for (const bucket of codexSnapshot.buckets) {
            const limitLabel = bucket.limitName?.trim() || bucket.limitId
            if (bucket.primary) {
                trackers.push({
                    accountId: codexAccount.id,
                    accountName: codexAccount.name,
                    agent: 'codex',
                    agentLabel: 'Codex',
                    expectedResetAt: resetTimestamp('codex', bucket.primary.resetsAt),
                    label: `${limitLabel} · primary · ${Math.round(bucket.primary.usedPercent)}% used`,
                    limitId: bucket.limitId,
                    usedPercent: bucket.primary.usedPercent,
                    windowId: 'primary',
                })
            }
            if (bucket.secondary) {
                trackers.push({
                    accountId: codexAccount.id,
                    accountName: codexAccount.name,
                    agent: 'codex',
                    agentLabel: 'Codex',
                    expectedResetAt: resetTimestamp('codex', bucket.secondary.resetsAt),
                    label: `${limitLabel} · secondary · ${Math.round(bucket.secondary.usedPercent)}% used`,
                    limitId: bucket.limitId,
                    usedPercent: bucket.secondary.usedPercent,
                    windowId: 'secondary',
                })
            }
        }
    }

    return trackers
}

/** Projects active cards into identity-safe schedule choices. Paths remain labels only. */
export function cardScheduleOptions(cards: Card[], currentCardInternalId: string | undefined): ActionScheduleCardOption[] {
    return cards
        .filter(({ header }) => !!header.internalId && header.internalId !== currentCardInternalId)
        .map(({ header, path }) => ({
            cardInternalId: header.internalId!,
            label: `${header.title} · ${path}`,
            registrationState: header.status,
        }))
}

export function scheduleTargetStates(states: StateConfig[] | undefined) {
    return states?.map(({ state }) => state) ?? []
}

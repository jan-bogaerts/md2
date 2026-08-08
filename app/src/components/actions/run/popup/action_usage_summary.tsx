import { Box, ButtonBase, Stack, Tooltip, Typography, type SxProps, type Theme } from '@mui/material'
import type { ReactNode } from 'react'
import type { AgentConversation, AgentTokenUsage } from '../../../../data/data_types'
import type { ActionRunHistoryEntry, CommitReference } from '../../../../data/electron_action_bridge'
import type { AgentFileChangeUsage } from '../../../../services/agents/agent_usage'
import type { ActionUsageScope } from './action_usage_scope_store'
import { scopedActionUsage, type LineUsage } from './action_usage_summary_data'

const NUMBER_FORMAT = new Intl.NumberFormat('en-US')
const USAGE_CONTROL_SX: SxProps<Theme> = {
    borderBottom: '1px dotted',
    borderColor: 'custom.borderHover',
    borderRadius: '4px',
    color: 'text.secondary',
    cursor: 'pointer',
    fontSize: 'caption.fontSize',
    lineHeight: 'caption.lineHeight',
    px: 0.25,
    '&:hover': { bgcolor: 'custom.track', color: 'primary.main' },
    '&.Mui-focusVisible': {
        boxShadow: (theme) => `0 0 0 3px ${theme.palette.custom.primaryBg}`,
        color: 'primary.main',
        outline: '1px solid',
        outlineColor: 'primary.main',
    },
}

interface ActionUsageSummaryProps {
    actionId: string
    cardInternalId: string
    conversation: AgentConversation | null
    conversations: AgentConversation[]
    history: ActionRunHistoryEntry[]
    liveConversation: AgentConversation | null
    onToggleScope: () => void
    scope: ActionUsageScope
}

function commitLine(commit: CommitReference) {
    return `${commit.commit.slice(0, 7)}: +${NUMBER_FORMAT.format(commit.insertions)} / -${NUMBER_FORMAT.format(commit.deletions)}`
}

function scopeName(scope: ActionUsageScope) {
    return scope === 'conversation' ? 'Conversation' : 'Action/card'
}

function scopeTooltip(
    definition: string,
    conversationValue: string | null,
    actionCardValue: string,
    scope: ActionUsageScope,
    activeDetails?: ReactNode,
) {
    const switchTarget = scope === 'conversation' ? 'Action/card' : 'Conversation'
    const interactionExplanation = conversationValue === null
        ? 'Conversation unavailable; clicking keeps Action/card scope.'
        : `Click to switch to ${switchTarget}.`

    return (
        <Stack spacing={0.5}>
            <Typography color="inherit" variant="caption">{definition}</Typography>
            <Typography color="inherit" variant="caption">
                Active scope: {scopeName(scope)}. {interactionExplanation}
            </Typography>
            <Typography color="inherit" variant="caption">
                Conversation{scope === 'conversation' ? ' (active)' : ''}: {conversationValue ?? 'unavailable'}
            </Typography>
            <Typography color="inherit" variant="caption">
                Action/card{scope === 'actionCard' ? ' (active)' : ''}: {actionCardValue}
            </Typography>
            {activeDetails}
        </Stack>
    )
}

function tokenValue(usage: AgentTokenUsage) {
    return `${NUMBER_FORMAT.format(usage.totalTokens)} tokens`
}

function changeValue(usage: AgentFileChangeUsage) {
    return `+${NUMBER_FORMAT.format(usage.insertions)} / -${NUMBER_FORMAT.format(usage.deletions)}`
}

function lineValue(usage: LineUsage) {
    return `${NUMBER_FORMAT.format(usage.insertions + usage.deletions)} lines`
}

/** Three shared-scope usage controls for one agent action on one card. */
export function ActionUsageSummary(props: ActionUsageSummaryProps) {
    const { actionId, cardInternalId, conversation, conversations, history, liveConversation, onToggleScope, scope } = props
    const scopedUsage = scopedActionUsage(
        conversations,
        liveConversation,
        conversation,
        history,
        actionId,
        cardInternalId,
    )
    const conversationUsage = scopedUsage.conversation
    const activeScope: ActionUsageScope = scope === 'conversation' && conversationUsage ? 'conversation' : 'actionCard'
    const activeUsage = activeScope === 'conversation' && conversationUsage
        ? conversationUsage
        : scopedUsage.actionCard
    const activeLines = activeUsage.lines
    const hasChanges = activeUsage.changes.insertions + activeUsage.changes.deletions > 0
    const totalLines = activeLines.insertions + activeLines.deletions
    const lineDetails = (
        <>
            <Typography color="inherit" variant="caption">
                files changed: {NUMBER_FORMAT.format(activeLines.filesChanged)}, insertions: {NUMBER_FORMAT.format(activeLines.insertions)},
                {' '}deletions: {NUMBER_FORMAT.format(activeLines.deletions)}
            </Typography>
            {activeLines.commits.map((commit, index) => (
                <Typography color="inherit" key={`${commit.repositoryRoot}\u0000${commit.commit}\u0000${index}`} variant="caption">
                    {commitLine(commit)}
                </Typography>
            ))}
        </>
    )
    const activeScopeName = scopeName(activeScope)

    return (
        <Box sx={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Tooltip describeChild title={scopeTooltip(
                'Tokens are cumulative provider token usage.',
                scopedUsage.conversation ? tokenValue(scopedUsage.conversation.tokens) : null,
                tokenValue(scopedUsage.actionCard.tokens),
                activeScope,
            )}>
                <ButtonBase
                    aria-label={`Tokens, ${activeScopeName} scope`}
                    onClick={onToggleScope}
                    sx={USAGE_CONTROL_SX}
                >
                    tokens: {NUMBER_FORMAT.format(activeUsage.tokens.totalTokens)}
                </ButtonBase>
            </Tooltip>
            {hasChanges ? (
                <Tooltip describeChild title={scopeTooltip(
                    'Changes are additions and deletions across completed provider file-change patches.',
                    scopedUsage.conversation ? changeValue(scopedUsage.conversation.changes) : null,
                    changeValue(scopedUsage.actionCard.changes),
                    activeScope,
                )}>
                    <ButtonBase
                        aria-label={`Changes, ${activeScopeName} scope`}
                        onClick={onToggleScope}
                        sx={USAGE_CONTROL_SX}
                    >
                        changes:&nbsp;
                        <Box component="span" sx={{ color: 'success.main' }}>
                            +{NUMBER_FORMAT.format(activeUsage.changes.insertions)}
                        </Box>
                        &nbsp;/&nbsp;
                        <Box component="span" sx={{ color: 'error.main' }}>
                            -{NUMBER_FORMAT.format(activeUsage.changes.deletions)}
                        </Box>
                    </ButtonBase>
                </Tooltip>
            ) : null}
            {totalLines > 0 ? (
                <Tooltip describeChild title={scopeTooltip(
                    'Lines are additions plus deletions in captured Git commit diffs.',
                    scopedUsage.conversation ? lineValue(scopedUsage.conversation.lines) : null,
                    lineValue(scopedUsage.actionCard.lines),
                    activeScope,
                    lineDetails,
                )}>
                    <ButtonBase
                        aria-label={`Lines, ${activeScopeName} scope`}
                        onClick={onToggleScope}
                        sx={USAGE_CONTROL_SX}
                    >
                        lines: {NUMBER_FORMAT.format(totalLines)}
                    </ButtonBase>
                </Tooltip>
            ) : null}
        </Box>
    )
}

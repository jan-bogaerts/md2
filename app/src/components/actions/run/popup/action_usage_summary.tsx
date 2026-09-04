import { Box, ButtonBase, Stack, Tooltip, Typography, type SxProps, type Theme } from '@mui/material'
import type { ReactNode } from 'react'
import type { AgentTokenUsage } from '../../../../data/data_types'
import { TokenCount } from '../../../agents/token_count'
import type { CommitReference } from '../../../../data/electron_action_bridge'
import type { AgentFileChangeUsage } from '../../../../services/agents/agent_usage'
import type { ActionUsageScope } from './action_usage_scope_store'
import type { ActionUsageValues } from './action_usage_summary_data'
import type { ActionUsageValuesSnapshot } from './action_usage_values_service'

const NUMBER_FORMAT = new Intl.NumberFormat('en-US')
const ZERO_CHANGES: AgentFileChangeUsage = { deletions: 0, insertions: 0 }
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
    onToggleScope: () => void
    snapshot: ActionUsageValuesSnapshot
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

interface ResolvedChanges extends AgentFileChangeUsage {
    fromCommits: boolean
}

/**
 * Picks the change source for one scope: the conversation file-change count when the transcript
 * reported one, otherwise the captured Git commit totals. `null` means neither source has data.
 */
function resolveChanges(usage: ActionUsageValues): ResolvedChanges | null {
    if (usage.changes) return { ...usage.changes, fromCommits: false }
    const { deletions, insertions } = usage.lines
    if (insertions + deletions === 0) return null

    return { deletions, fromCommits: true, insertions }
}

/** Two shared-scope usage controls for one agent action on one card. */
export function ActionUsageSummary(props: ActionUsageSummaryProps) {
    const { onToggleScope, snapshot } = props
    const conversationUsage = snapshot.conversation
    const activeScope = snapshot.activeScope
    const activeUsage = activeScope === 'conversation' && conversationUsage
        ? conversationUsage
        : snapshot.actionCard
    const activeLines = activeUsage.lines
    const activeChanges = resolveChanges(activeUsage)
    const conversationChanges = snapshot.conversation ? resolveChanges(snapshot.conversation) : null
    const actionCardChanges = resolveChanges(snapshot.actionCard)
    const commitDetails = (
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
        <Box
            sx={{
                alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 1, minWidth: 0,
                '@container (max-width: 420px)': { flexWrap: 'nowrap', gap: 0.5 },
            }}
        >
            <Tooltip describeChild title={scopeTooltip(
                'Tokens are cumulative provider token usage.',
                snapshot.conversation ? tokenValue(snapshot.conversation.tokens) : null,
                tokenValue(snapshot.actionCard.tokens),
                activeScope,
            )}>
                <ButtonBase
                    aria-label={`Tokens, ${activeScopeName} scope`}
                    onClick={onToggleScope}
                    sx={USAGE_CONTROL_SX}
                >
                    <Box
                        component="span"
                        data-usage-prefix
                        sx={{ '@container (max-width: 420px)': { display: 'none' } }}
                    >
                        tokens:{' '}
                    </Box>
                    <TokenCount value={activeUsage.tokens.totalTokens} />
                </ButtonBase>
            </Tooltip>
            {activeChanges ? (
                <Tooltip describeChild title={scopeTooltip(
                    activeChanges.fromCommits
                        ? 'Changes are additions plus deletions in captured Git commit diffs; the conversation reported no file changes.'
                        : 'Changes are additions and deletions across completed provider file-change patches.',
                    snapshot.conversation ? changeValue(conversationChanges ?? ZERO_CHANGES) : null,
                    changeValue(actionCardChanges ?? ZERO_CHANGES),
                    activeScope,
                    activeChanges.fromCommits ? commitDetails : undefined,
                )}>
                    <ButtonBase
                        aria-label={`Changes, ${activeScopeName} scope`}
                        onClick={onToggleScope}
                        sx={USAGE_CONTROL_SX}
                    >
                        <Box
                            component="span"
                            data-usage-prefix
                            sx={{ '@container (max-width: 420px)': { display: 'none' } }}
                        >
                            changes:&nbsp;
                        </Box>
                        <Box component="span" sx={{ color: 'success.main' }}>
                            +{NUMBER_FORMAT.format(activeChanges.insertions)}
                        </Box>
                        &nbsp;/&nbsp;
                        <Box component="span" sx={{ color: 'error.main' }}>
                            -{NUMBER_FORMAT.format(activeChanges.deletions)}
                        </Box>
                    </ButtonBase>
                </Tooltip>
            ) : null}
        </Box>
    )
}

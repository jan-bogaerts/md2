import { Box, Stack, Tooltip, Typography } from '@mui/material'
import type { AgentConversation } from '../../data/data_types'
import type { ActionRunHistoryEntry, CommitReference } from '../../data/electron_action_bridge'
import { actionCardAgentTokenUsage } from '../../services/agents/agent_usage'
import { AgentUsageDisplay } from '../agents/agent_usage_display'

const NUMBER_FORMAT = new Intl.NumberFormat('en-US')

interface ActionUsageSummaryProps {
    actionId: string
    cardPath: string
    conversations: AgentConversation[]
    history: ActionRunHistoryEntry[]
}

interface LineUsage {
    commits: CommitReference[]
    deletions: number
    filesChanged: number
    insertions: number
}

function lineUsage(history: ActionRunHistoryEntry[]): LineUsage {
    const commits = history.flatMap((entry) => entry.commits ?? [])

    return commits.reduce((totals, commit) => ({
        commits: totals.commits,
        deletions: totals.deletions + commit.deletions,
        filesChanged: totals.filesChanged + commit.filesChanged,
        insertions: totals.insertions + commit.insertions,
    }), { commits, deletions: 0, filesChanged: 0, insertions: 0 })
}

function commitLine(commit: CommitReference) {
    return `${commit.commit.slice(0, 7)}: +${NUMBER_FORMAT.format(commit.insertions)} / -${NUMBER_FORMAT.format(commit.deletions)}`
}

/** Compact token and changed-line totals for one agent action on one card. */
export function ActionUsageSummary(props: ActionUsageSummaryProps) {
    const { actionId, cardPath, conversations, history } = props
    const usage = actionCardAgentTokenUsage(conversations, actionId, cardPath)
    const lines = lineUsage(history)
    const totalLines = lines.insertions + lines.deletions
    const lineTooltip = (
        <Stack spacing={0.5}>
            <Typography color="inherit" variant="caption">
                files changed: {NUMBER_FORMAT.format(lines.filesChanged)}, insertions: {NUMBER_FORMAT.format(lines.insertions)},
                {' '}deletions: {NUMBER_FORMAT.format(lines.deletions)}
            </Typography>
            {lines.commits.map((commit, index) => (
                <Typography color="inherit" key={`${commit.repositoryRoot}\u0000${commit.commit}\u0000${index}`} variant="caption">
                    {commitLine(commit)}
                </Typography>
            ))}
        </Stack>
    )

    return (
        <Box sx={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <AgentUsageDisplay usage={usage} />
            {lines.commits.length > 0 ? (
                <Tooltip describeChild title={lineTooltip}>
                    <Typography component="span" sx={{ color: 'text.secondary', cursor: 'help' }} tabIndex={0} variant="caption">
                        lines: {NUMBER_FORMAT.format(totalLines)}
                    </Typography>
                </Tooltip>
            ) : null}
        </Box>
    )
}

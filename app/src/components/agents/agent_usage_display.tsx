import { Box, Typography } from '@mui/material'
import type { AgentTokenUsage } from '../../data/data_types'

const TOKEN_NUMBER_FORMAT = new Intl.NumberFormat('en-US')
const COST_NUMBER_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6, minimumFractionDigits: 2 })

interface AgentUsageDisplayProps {
    usage: AgentTokenUsage
}

function tokenCount(value: number) {
    return TOKEN_NUMBER_FORMAT.format(value)
}

/** Compact read-only token bucket and provider-reported cost summary. */
export function AgentUsageDisplay(props: AgentUsageDisplayProps) {
    const { usage } = props
    const accessibleLabel = [
        `Token usage: ${usage.totalTokens} total`,
        `${usage.inputTokens} input`,
        `${usage.cachedInputTokens} cached input`,
        `${usage.outputTokens} output`,
        `${usage.reasoningTokens} reasoning`,
        ...(usage.costUsd === undefined ? [] : [`$${COST_NUMBER_FORMAT.format(usage.costUsd)} reported cost`]),
    ].join(', ')

    return (
        <Box aria-label={accessibleLabel} sx={{ alignItems: 'center', color: 'text.secondary', display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            <Typography component="span" variant="caption"><strong>{tokenCount(usage.totalTokens)}</strong> tokens</Typography>
            <Typography component="span" variant="caption">input {tokenCount(usage.inputTokens)}</Typography>
            <Typography component="span" variant="caption">cached {tokenCount(usage.cachedInputTokens)}</Typography>
            <Typography component="span" variant="caption">output {tokenCount(usage.outputTokens)}</Typography>
            <Typography component="span" variant="caption">reasoning {tokenCount(usage.reasoningTokens)}</Typography>
            {usage.costUsd === undefined ? null : (
                <Typography component="span" variant="caption">${COST_NUMBER_FORMAT.format(usage.costUsd)}</Typography>
            )}
        </Box>
    )
}

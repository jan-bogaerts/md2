import { Tooltip, Typography } from '@mui/material'
import type { AgentTokenUsage } from '../../data/data_types'
import { formatTokenCount } from './token_count'

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
    const tooltipLabel = [
        `total: ${tokenCount(usage.totalTokens)}`,
        `input: ${tokenCount(usage.inputTokens)}`,
        `cached input: ${tokenCount(usage.cachedInputTokens)}`,
        `output: ${tokenCount(usage.outputTokens)}`,
        `reasoning: ${tokenCount(usage.reasoningTokens)}`,
        ...(usage.costUsd === undefined ? [] : [`reported cost: $${COST_NUMBER_FORMAT.format(usage.costUsd)}`]),
    ].join(', ')

    return (
        <Tooltip describeChild title={tooltipLabel}>
            <Typography component="span" sx={{ color: 'text.secondary', cursor: 'help' }} tabIndex={0} variant="caption">
                tokens: {formatTokenCount(usage.totalTokens)}
            </Typography>
        </Tooltip>
    )
}

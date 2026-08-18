import { Box, Tooltip, Typography } from '@mui/material'
import type { StatsChartRow } from '../../services/stats/project_stats_service'

const MAXIMUM_BAR_HEIGHT = 240
const MINIMUM_VISIBLE_BAR_HEIGHT = 2

interface StatsBarChartProps {
    rows: StatsChartRow[]
}

function formattedValue(row: StatsChartRow) {
    if (row.unit === 'milliseconds') {
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(row.value / 1_000) + ' seconds'
    }

    return `${new Intl.NumberFormat().format(row.value)} ${row.unit}`
}

/** Accessible themed bar chart for exact stats rows. */
export function StatsBarChart({ rows }: StatsBarChartProps) {
    const maximumValue = Math.max(...rows.map(({ value }) => value), 0)

    return (
        <Box aria-label="Stats bar chart" role="list" sx={{ alignItems: 'stretch', display: 'flex', flex: 1, gap: 1.5, minHeight: 0, overflowX: 'auto', p: 2 }}>
            {rows.map((row) => {
                const value = formattedValue(row)
                const label = row.displayLabel
                const boundary = row.utcBucketStart ? ` UTC bucket boundary ${row.utcBucketStart}.` : ''
                const height = maximumValue === 0 ? MINIMUM_VISIBLE_BAR_HEIGHT : Math.max(
                    MINIMUM_VISIBLE_BAR_HEIGHT,
                    (row.value / maximumValue) * MAXIMUM_BAR_HEIGHT,
                )

                return (
                    <Box
                        aria-label={`${label}: ${value}.${boundary}`}
                        key={`${row.identity}:${row.metric}`}
                        role="listitem"
                        sx={{ display: 'flex', flex: '0 0 92px', flexDirection: 'column', justifyContent: 'flex-end', minWidth: 0 }}
                    >
                        <Typography align="center" color="text.secondary" title={value} variant="caption">{value}</Typography>
                        <Tooltip title={row.utcBucketStart ? `${value}; UTC bucket boundary ${row.utcBucketStart}` : value}>
                            <Box
                                sx={{
                                    bgcolor: 'primary.main',
                                    borderRadius: 1,
                                    height,
                                    minHeight: MINIMUM_VISIBLE_BAR_HEIGHT,
                                    width: '100%',
                                }}
                            />
                        </Tooltip>
                        <Typography align="center" color="text.secondary" noWrap title={label} variant="caption">{label}</Typography>
                    </Box>
                )
            })}
        </Box>
    )
}

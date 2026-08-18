import { Box, Button, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import type { ChangeEvent } from 'react'
import type { SelectChangeEvent } from '@mui/material'
import { dialogService } from '../../services/dialog_service'
import { projectStatsService, type ProjectStatsSnapshot } from '../../services/stats/project_stats_service'
import { downloadStatsCsv } from './stats_csv'

interface StatsControlsProps {
    snapshot: ProjectStatsSnapshot
}

function localDateTimeValue(isoTimestamp: string | null) {
    if (!isoTimestamp) return ''
    const date = new Date(isoTimestamp)
    const localMilliseconds = date.getTime() - date.getTimezoneOffset() * 60_000

    return new Date(localMilliseconds).toISOString().slice(0, 16)
}

function isoTimestampFromInput(value: string) {
    return value ? new Date(value).toISOString() : null
}

function setStatsControls(changes: Parameters<typeof projectStatsService.setControls>[0]) {
    try {
        projectStatsService.setControls(changes)
    } catch (error) {
        dialogService.error(error, { fallbackMessage: 'Stats filters could not be updated' })
    }
}

/** Service-backed chart and range controls. */
export function StatsControls({ snapshot }: StatsControlsProps) {
    const { controls, rows } = snapshot
    const handleDatasetChange = (event: SelectChangeEvent) => {
        setStatsControls({ dataset: event.target.value as typeof controls.dataset })
    }
    const handleActivityMetricChange = (event: SelectChangeEvent) => {
        setStatsControls({ activityMetric: event.target.value as typeof controls.activityMetric })
    }
    const handleGranularityChange = (event: SelectChangeEvent) => {
        setStatsControls({ granularity: event.target.value as typeof controls.granularity })
    }
    const handleTotalsGroupingChange = (event: SelectChangeEvent) => {
        setStatsControls({ totalsGrouping: event.target.value as typeof controls.totalsGrouping })
    }
    const handleTotalsMetricChange = (event: SelectChangeEvent) => {
        setStatsControls({ totalsMetric: event.target.value as typeof controls.totalsMetric })
    }
    const handleStartChange = (event: ChangeEvent<HTMLInputElement>) => {
        setStatsControls({ startUtc: isoTimestampFromInput(event.target.value) })
    }
    const handleEndChange = (event: ChangeEvent<HTMLInputElement>) => {
        setStatsControls({ endUtc: isoTimestampFromInput(event.target.value) })
    }
    const handleExport = () => downloadStatsCsv(controls.dataset, rows)

    return (
        <Box sx={{ alignItems: 'flex-end', display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            <Stack spacing={0.75}>
                <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Dataset</Typography>
                <Select aria-label="Dataset" onChange={handleDatasetChange} size="small" value={controls.dataset}>
                    <MenuItem value="activityOverTime">Activity over time</MenuItem>
                    <MenuItem value="totals">Totals by Card/Action</MenuItem>
                </Select>
            </Stack>
            {controls.dataset === 'activityOverTime' ? (
                <>
                    <Stack spacing={0.75}>
                        <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Metric</Typography>
                        <Select aria-label="Activity metric" onChange={handleActivityMetricChange} size="small" value={controls.activityMetric}>
                            <MenuItem value="cards">Distinct cards</MenuItem>
                            <MenuItem value="actions">Completed actions</MenuItem>
                            <MenuItem disabled={!snapshot.tokenTimeAvailable} value="tokens">Token usage</MenuItem>
                        </Select>
                    </Stack>
                    <Stack spacing={0.75}>
                        <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Granularity</Typography>
                        <Select aria-label="Granularity" onChange={handleGranularityChange} size="small" value={controls.granularity}>
                            <MenuItem value="day">Day</MenuItem>
                            <MenuItem value="week">Week</MenuItem>
                            <MenuItem value="month">Month</MenuItem>
                        </Select>
                    </Stack>
                </>
            ) : (
                <>
                    <Stack spacing={0.75}>
                        <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Grouping</Typography>
                        <Select aria-label="Totals grouping" onChange={handleTotalsGroupingChange} size="small" value={controls.totalsGrouping}>
                            <MenuItem value="card">Card</MenuItem>
                            <MenuItem value="action">Action</MenuItem>
                        </Select>
                    </Stack>
                    <Stack spacing={0.75}>
                        <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Metric</Typography>
                        <Select aria-label="Totals metric" onChange={handleTotalsMetricChange} size="small" value={controls.totalsMetric}>
                            <MenuItem value="duration">Measured duration</MenuItem>
                            <MenuItem value="tokens">Token usage</MenuItem>
                        </Select>
                    </Stack>
                </>
            )}
            <Stack spacing={0.75}>
                <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">From (local time)</Typography>
                <TextField
                    onChange={handleStartChange}
                    size="small"
                    slotProps={{ htmlInput: { 'aria-label': 'Range start local time' } }}
                    type="datetime-local"
                    value={localDateTimeValue(controls.startUtc)}
                />
            </Stack>
            <Stack spacing={0.75}>
                <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">To (local time)</Typography>
                <TextField
                    onChange={handleEndChange}
                    size="small"
                    slotProps={{ htmlInput: { 'aria-label': 'Range end local time' } }}
                    type="datetime-local"
                    value={localDateTimeValue(controls.endUtc)}
                />
            </Stack>
            <Button disabled={rows.length === 0} onClick={handleExport} variant="outlined">Export CSV</Button>
        </Box>
    )
}

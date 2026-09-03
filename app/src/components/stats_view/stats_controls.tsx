import { Box, Button, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import type { ChangeEvent } from 'react';
import { dialogService } from '../../services/dialog_service';
import { projectStatsService } from '../../services/stats/project_stats_service';
import type {
    ProjectStatsSnapshot,
    StatsChartRow,
    StatsControls as StatsControlValues,
    StatsDataset,
} from '../../services/stats/project_stats_types';
import { downloadStatsCsv } from './stats_csv';

interface StatsControlsProps {
    snapshot: ProjectStatsSnapshot;
}

function localDateTimeValue(isoTimestamp: string | null) {
    if (!isoTimestamp) return '';
    const date = new Date(isoTimestamp);
    const localMilliseconds = date.getTime() - date.getTimezoneOffset() * 60_000;

    return new Date(localMilliseconds).toISOString().slice(0, 16);
}

function isoTimestampFromInput(value: string) {
    return value ? new Date(value).toISOString() : null;
}

function setStatsControls(changes: Partial<StatsControlValues>) {
    try {
        projectStatsService.setControls(changes);
    } catch (error) {
        dialogService.error(error, { fallbackMessage: 'Stats filters could not be updated' });
    }
}

function selectedValues(value: string | string[]) {
    return typeof value === 'string' ? value.split(',').filter((entry) => entry.length > 0) : value;
}

function multipleValueLabel(value: string[]) {
    return value.length === 0 ? 'All' : value.join(', ');
}

function handleDatasetChange(event: SelectChangeEvent) {
    setStatsControls({ dataset: event.target.value as StatsControlValues['dataset'] });
}

function handleActivityMetricChange(event: SelectChangeEvent) {
    setStatsControls({ activityMetric: event.target.value as StatsControlValues['activityMetric'] });
}

function handleActivityGranularityChange(event: SelectChangeEvent) {
    setStatsControls({ activityGranularity: event.target.value as StatsControlValues['activityGranularity'] });
}

function handlePerformanceMetricChange(event: SelectChangeEvent) {
    setStatsControls({ performanceMetric: event.target.value as StatsControlValues['performanceMetric'] });
}

function handlePerformanceAggregationChange(event: SelectChangeEvent) {
    setStatsControls({ performanceAggregation: event.target.value as StatsControlValues['performanceAggregation'] });
}

function handlePerformanceGroupingChange(event: SelectChangeEvent) {
    setStatsControls({ performanceGrouping: event.target.value as StatsControlValues['performanceGrouping'] });
}

function handlePerformanceGranularityChange(event: SelectChangeEvent) {
    setStatsControls({ performanceGranularity: event.target.value as StatsControlValues['performanceGranularity'] });
}

function handleActionFilterChange(event: SelectChangeEvent<string[]>) {
    setStatsControls({ performanceActionIds: selectedValues(event.target.value) });
}

function handleAgentFilterChange(event: SelectChangeEvent<string[]>) {
    setStatsControls({ performanceAgentIds: selectedValues(event.target.value) });
}

function handleModelFilterChange(event: SelectChangeEvent<string[]>) {
    setStatsControls({ performanceModelIds: selectedValues(event.target.value) });
}

function handleUsageGranularityChange(event: SelectChangeEvent) {
    setStatsControls({ usageGranularity: event.target.value as StatsControlValues['usageGranularity'] });
}

function handleTotalsGroupingChange(event: SelectChangeEvent) {
    setStatsControls({ totalsGrouping: event.target.value as StatsControlValues['totalsGrouping'] });
}

function handleTotalsMetricChange(event: SelectChangeEvent) {
    setStatsControls({ totalsMetric: event.target.value as StatsControlValues['totalsMetric'] });
}

function handleStartChange(event: ChangeEvent<HTMLInputElement>) {
    setStatsControls({ startUtc: isoTimestampFromInput(event.target.value) });
}

function handleEndChange(event: ChangeEvent<HTMLInputElement>) {
    setStatsControls({ endUtc: isoTimestampFromInput(event.target.value) });
}

function handleReleaseChange(event: SelectChangeEvent) {
    setStatsControls({ releaseIdentity: event.target.value });
}

function exportStats(dataset: StatsDataset, rows: StatsChartRow[]) {
    downloadStatsCsv(dataset, rows);
}

/** Service-backed dataset, entity, metric, and date controls. */
export function StatsControls({ snapshot }: StatsControlsProps) {
    const { controls, options, rows } = snapshot;
    const handleExport = exportStats.bind(null, controls.dataset, rows);

    return (
        <Box sx={{ alignItems: 'flex-end', display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            <Stack spacing={0.75}>
                <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Dataset</Typography>
                <Select aria-label="Dataset" onChange={handleDatasetChange} size="small" value={controls.dataset}>
                    <MenuItem value="activityOverTime">Activity over time</MenuItem>
                    <MenuItem value="agentPerformance">Agent/model performance</MenuItem>
                    <MenuItem value="usageComparison">Project usage vs account usage</MenuItem>
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
                        <Select aria-label="Activity granularity" onChange={handleActivityGranularityChange} size="small" value={controls.activityGranularity}>
                            <MenuItem value="day">Day</MenuItem>
                            <MenuItem value="week">Week</MenuItem>
                            <MenuItem value="month">Month</MenuItem>
                        </Select>
                    </Stack>
                </>
            ) : null}
            {controls.dataset === 'agentPerformance' ? (
                <>
                    <Stack spacing={0.75}>
                        <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Metric</Typography>
                        <Select aria-label="Performance metric" onChange={handlePerformanceMetricChange} size="small" value={controls.performanceMetric}>
                            <MenuItem value="duration">Measured duration</MenuItem>
                            <MenuItem value="tokens">Tokens</MenuItem>
                            <MenuItem value="toolCalls">Tool calls</MenuItem>
                        </Select>
                    </Stack>
                    <Stack spacing={0.75}>
                        <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Aggregation</Typography>
                        <Select aria-label="Performance aggregation" onChange={handlePerformanceAggregationChange} size="small" value={controls.performanceAggregation}>
                            <MenuItem value="sum">Sum</MenuItem>
                            <MenuItem value="average">Average</MenuItem>
                            <MenuItem value="averageWithDeviation">Average ± std dev</MenuItem>
                            <MenuItem value="median">Median</MenuItem>
                        </Select>
                    </Stack>
                    <Stack spacing={0.75}>
                        <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Grouping</Typography>
                        <Select aria-label="Performance grouping" onChange={handlePerformanceGroupingChange} size="small" value={controls.performanceGrouping}>
                            <MenuItem value="agent">Agent</MenuItem>
                            <MenuItem value="model">Model</MenuItem>
                        </Select>
                    </Stack>
                    <Stack spacing={0.75}>
                        <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Granularity</Typography>
                        <Select aria-label="Performance granularity" onChange={handlePerformanceGranularityChange} size="small" value={controls.performanceGranularity}>
                            <MenuItem value="day">Day</MenuItem>
                            <MenuItem value="week">Week</MenuItem>
                        </Select>
                    </Stack>
                    <Stack spacing={0.75}>
                        <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Actions</Typography>
                        <Select<string[]>
                            aria-label="Action filter"
                            multiple
                            onChange={handleActionFilterChange}
                            renderValue={multipleValueLabel}
                            size="small"
                            value={controls.performanceActionIds}
                        >
                            {options.actions.map(({ identity, label }) => <MenuItem key={identity} value={identity}>{label}</MenuItem>)}
                        </Select>
                    </Stack>
                    {controls.performanceGrouping === 'agent' ? (
                        <Stack spacing={0.75}>
                            <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Agents</Typography>
                            <Select<string[]> aria-label="Agent filter" multiple onChange={handleAgentFilterChange} renderValue={multipleValueLabel} size="small" value={controls.performanceAgentIds}>
                                {options.agents.map(({ identity, label }) => <MenuItem key={identity} value={identity}>{label}</MenuItem>)}
                            </Select>
                        </Stack>
                    ) : (
                        <Stack spacing={0.75}>
                            <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Models</Typography>
                            <Select<string[]> aria-label="Model filter" multiple onChange={handleModelFilterChange} renderValue={multipleValueLabel} size="small" value={controls.performanceModelIds}>
                                {options.models.map(({ identity, label }) => <MenuItem key={identity} value={identity}>{label}</MenuItem>)}
                            </Select>
                        </Stack>
                    )}
                </>
            ) : null}
            {controls.dataset === 'usageComparison' ? (
                <Stack spacing={0.75}>
                    <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Granularity</Typography>
                    <Select aria-label="Usage granularity" onChange={handleUsageGranularityChange} size="small" value={controls.usageGranularity}>
                        <MenuItem value="day">Day</MenuItem>
                        <MenuItem value="week">Week</MenuItem>
                    </Select>
                </Stack>
            ) : null}
            {controls.dataset === 'totals' ? (
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
                            <MenuItem value="cost">Estimated cost</MenuItem>
                        </Select>
                    </Stack>
                </>
            ) : null}
            <Stack spacing={0.75}>
                <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">Releases</Typography>
                <Select aria-label="Releases" onChange={handleReleaseChange} size="small" value={controls.releaseIdentity}>
                    {options.releases.map(({ identity, label }) => <MenuItem key={identity} value={identity}>{label}</MenuItem>)}
                </Select>
            </Stack>
            <Stack spacing={0.75}>
                <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">From (local time)</Typography>
                <TextField onChange={handleStartChange} size="small" slotProps={{ htmlInput: { 'aria-label': 'Range start local time' } }} type="datetime-local" value={localDateTimeValue(controls.startUtc)} />
            </Stack>
            <Stack spacing={0.75}>
                <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">To (local time)</Typography>
                <TextField onChange={handleEndChange} size="small" slotProps={{ htmlInput: { 'aria-label': 'Range end local time' } }} type="datetime-local" value={localDateTimeValue(controls.endUtc)} />
            </Stack>
            <Button disabled={rows.length === 0} onClick={handleExport} variant="outlined">Export CSV</Button>
        </Box>
    );
}

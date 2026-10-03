import { Box, Divider, MenuItem, Popover, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import DateRangeOutlined from '@mui/icons-material/DateRangeOutlined';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import BarChartOutlined from '@mui/icons-material/BarChartOutlined';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import { useState, useSyncExternalStore } from 'react';
import type { ChangeEvent } from 'react';
import { dialogService } from '../../services/dialog_service';
import { projectStatsService, type ProjectStatsService } from '../../services/stats/project_stats_service';
import type {
    StatsChartRow,
    StatsControls as StatsControlValues,
    StatsDataset,
    StatsReleaseOption,
} from '../../services/stats/project_stats_types';
import { MenuIconButton } from '../shell/menu/menu_icon_button';
import { MenuSelect } from '../shell/menu/menu_select';
import { Section } from '../shell/menu/section';
import { Tab } from '../shell/menu/tab';
import { downloadStatsCsv } from './stats_csv';

const ALL_RELEASES_IDENTITY = 'all-releases';

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

function releaseValueLabel(releases: StatsReleaseOption[], values: string[]) {
    if (values.includes(ALL_RELEASES_IDENTITY)) return 'All releases';
    if (values.length === 0) return 'No releases';
    return values.map((identity) => releases.find((release) => release.identity === identity)?.label ?? identity).join(', ');
}

function handleDatasetChange(event: SelectChangeEvent) {
    setStatsControls({ dataset: event.target.value as StatsControlValues['dataset'] });
}

function handleActivityMetricChange(event: SelectChangeEvent) {
    setStatsControls({ activityMetric: event.target.value as StatsControlValues['activityMetric'] });
}

function handleGranularityChange(event: SelectChangeEvent) {
    setStatsControls({ granularity: event.target.value as StatsControlValues['granularity'] });
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

function handleActionFilterChange(event: SelectChangeEvent<string[]>) {
    setStatsControls({ performanceActionIds: selectedValues(event.target.value) });
}

function handleAgentFilterChange(event: SelectChangeEvent<string[]>) {
    setStatsControls({ performanceAgentIds: selectedValues(event.target.value) });
}

function handleModelFilterChange(event: SelectChangeEvent<string[]>) {
    setStatsControls({ performanceModelIds: selectedValues(event.target.value) });
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

function handleReleaseChange(event: SelectChangeEvent<string[]>) {
    const values = selectedValues(event.target.value);
    const currentSelection = projectStatsService.getSnapshot().controls.releaseSelection;
    if (values.includes(ALL_RELEASES_IDENTITY) && currentSelection.mode !== 'all') {
        setStatsControls({ releaseSelection: { mode: 'all' } });
        return;
    }
    setStatsControls({ releaseSelection: { mode: 'selected', identities: values.filter((value) => value !== ALL_RELEASES_IDENTITY) } });
}

function handleTokenFormatChange(event: SelectChangeEvent) {
    setStatsControls({ shortTokenCounts: event.target.value === 'short' });
}

function exportStats(dataset: StatsDataset, rows: StatsChartRow[]) {
    downloadStatsCsv(dataset, rows);
}

/** Stats app-menu content; subscribes on its own so control changes never republish the stats page. */
export function StatsMenuTab({ service = projectStatsService }: { service?: ProjectStatsService }) {
    const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);
    const modeChoice = useSyncExternalStore(service.subscribeViewMode, service.getViewModeChoice, service.getViewModeChoice);
    const theme = useTheme();
    const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
    const viewMode = modeChoice ?? (isSmallScreen ? 'tables' : 'charts');
    const [dateRangeAnchorElement, setDateRangeAnchorElement] = useState<HTMLSpanElement | null>(null);
    const [isDateRangeOpen, setIsDateRangeOpen] = useState(false);
    const { controls, options, rows } = snapshot;
    const releaseValues = controls.releaseSelection.mode === 'all'
        ? [ALL_RELEASES_IDENTITY]
        : controls.releaseSelection.identities;
    const renderReleaseValue = releaseValueLabel.bind(null, options.releases);
    const disabled = snapshot.status === 'loading' || snapshot.status === 'error';
    const handleExport = exportStats.bind(null, controls.dataset, rows);
    const selectTables = service.setViewModeChoice.bind(service, 'tables');
    const selectCharts = service.setViewModeChoice.bind(service, 'charts');

    const openDateRange = () => {
        setIsDateRangeOpen(true);
    };

    const closeDateRange = () => {
        setIsDateRangeOpen(false);
    };

    return (
        <Tab>
            <Section label="Dataset">
                <MenuSelect disabled={disabled} label="Dataset" minWidth={180} onChange={handleDatasetChange} value={controls.dataset}>
                    <MenuItem value="activityOverTime">Activity over time</MenuItem>
                    <MenuItem value="agentPerformance">Agent/model performance</MenuItem>
                    <MenuItem value="usageComparison">Project usage vs account usage</MenuItem>
                    <MenuItem value="totals">Totals by Card/Action</MenuItem>
                </MenuSelect>
            </Section>
            <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
            <Section label="View">
                <Box role="group" aria-label="Stats display mode" sx={{ display: 'inline-flex' }}>
                    <MenuIconButton label="Tables" onClick={selectTables} pressed={viewMode === 'tables'}>
                        <TableChartOutlined fontSize="small" />
                    </MenuIconButton>
                    <MenuIconButton label="Charts" onClick={selectCharts} pressed={viewMode === 'charts'}>
                        <BarChartOutlined fontSize="small" />
                    </MenuIconButton>
                </Box>
                {controls.dataset === 'activityOverTime' ? (
                    <>
                        <MenuSelect disabled={disabled} label="Activity metric" onChange={handleActivityMetricChange} value={controls.activityMetric}>
                            <MenuItem value="cards">Distinct cards</MenuItem>
                            <MenuItem value="actions">Completed actions</MenuItem>
                            <MenuItem disabled={!snapshot.tokenTimeAvailable} value="tokens">Token usage</MenuItem>
                        </MenuSelect>
                        <MenuSelect disabled={disabled} label="Activity granularity" onChange={handleGranularityChange} value={controls.granularity}>
                            <MenuItem value="day">Day</MenuItem>
                            <MenuItem value="week">Week</MenuItem>
                            <MenuItem value="month">Month</MenuItem>
                        </MenuSelect>
                    </>
                ) : null}
                {controls.dataset === 'agentPerformance' ? (
                    <>
                        <MenuSelect disabled={disabled} label="Performance metric" onChange={handlePerformanceMetricChange} value={controls.performanceMetric}>
                            <MenuItem value="duration">Measured duration</MenuItem>
                            <MenuItem value="tokens">Tokens</MenuItem>
                            <MenuItem value="toolCalls">Tool calls</MenuItem>
                        </MenuSelect>
                        <MenuSelect disabled={disabled} label="Performance aggregation" minWidth={170} onChange={handlePerformanceAggregationChange} value={controls.performanceAggregation}>
                            <MenuItem value="sum">Sum</MenuItem>
                            <MenuItem value="average">Average</MenuItem>
                            <MenuItem value="averageWithDeviation">Average ± std dev</MenuItem>
                            <MenuItem value="median">Median</MenuItem>
                        </MenuSelect>
                        <MenuSelect disabled={disabled} label="Performance grouping" onChange={handlePerformanceGroupingChange} value={controls.performanceGrouping}>
                            <MenuItem value="agent">Agent</MenuItem>
                            <MenuItem value="model">Model</MenuItem>
                        </MenuSelect>
                        <MenuSelect disabled={disabled} label="Performance granularity" onChange={handleGranularityChange} value={controls.granularity}>
                            <MenuItem value="day">Day</MenuItem>
                            <MenuItem value="week">Week</MenuItem>
                            <MenuItem value="month">Month</MenuItem>
                        </MenuSelect>
                        <MenuSelect<string[]>
                            disabled={disabled}
                            label="Action filter"
                            multiple
                            onChange={handleActionFilterChange}
                            renderValue={multipleValueLabel}
                            value={controls.performanceActionIds}
                        >
                            {options.actions.map(({ identity, label }) => <MenuItem key={identity} value={identity}>{label}</MenuItem>)}
                        </MenuSelect>
                        {controls.performanceGrouping === 'agent' ? (
                            <MenuSelect<string[]>
                                disabled={disabled}
                                label="Agent filter"
                                multiple
                                onChange={handleAgentFilterChange}
                                renderValue={multipleValueLabel}
                                value={controls.performanceAgentIds}
                            >
                                {options.agents.map(({ identity, label }) => <MenuItem key={identity} value={identity}>{label}</MenuItem>)}
                            </MenuSelect>
                        ) : (
                            <MenuSelect<string[]>
                                disabled={disabled}
                                label="Model filter"
                                multiple
                                onChange={handleModelFilterChange}
                                renderValue={multipleValueLabel}
                                value={controls.performanceModelIds}
                            >
                                {options.models.map(({ identity, label }) => <MenuItem key={identity} value={identity}>{label}</MenuItem>)}
                            </MenuSelect>
                        )}
                    </>
                ) : null}
                {controls.dataset === 'usageComparison' ? (
                    <MenuSelect disabled={disabled} label="Usage granularity" onChange={handleGranularityChange} value={controls.granularity}>
                        <MenuItem value="day">Day</MenuItem>
                        <MenuItem value="week">Week</MenuItem>
                        <MenuItem value="month">Month</MenuItem>
                    </MenuSelect>
                ) : null}
                {controls.dataset === 'totals' ? (
                    <>
                        <MenuSelect disabled={disabled} label="Totals grouping" onChange={handleTotalsGroupingChange} value={controls.totalsGrouping}>
                            <MenuItem value="card">Card</MenuItem>
                            <MenuItem value="action">Action</MenuItem>
                        </MenuSelect>
                        <MenuSelect disabled={disabled} label="Totals metric" onChange={handleTotalsMetricChange} value={controls.totalsMetric}>
                            <MenuItem value="duration">Measured duration</MenuItem>
                            <MenuItem value="tokens">Token usage</MenuItem>
                            <MenuItem value="cost">Estimated cost</MenuItem>
                        </MenuSelect>
                    </>
                ) : null}
            </Section>
            <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
            <Section label="Filters">
                <MenuSelect<string[]> disabled={disabled} label="Releases" multiple onChange={handleReleaseChange} renderValue={renderReleaseValue} value={releaseValues}>
                    <MenuItem value={ALL_RELEASES_IDENTITY}>All releases</MenuItem>
                    {options.releases.map(({ identity, label }) => <MenuItem key={identity} value={identity}>{label}</MenuItem>)}
                </MenuSelect>
                <MenuSelect disabled={disabled} label="Token number format" minWidth={160} onChange={handleTokenFormatChange} value={controls.shortTokenCounts ? 'short' : 'exact'}>
                    <MenuItem value="short">Shortened (1.2K)</MenuItem>
                    <MenuItem value="exact">Exact (1,234)</MenuItem>
                </MenuSelect>
                <Box component="span" ref={setDateRangeAnchorElement} sx={{ display: 'inline-flex' }}>
                    <MenuIconButton disabled={disabled} label="Date range" onClick={openDateRange}>
                        <DateRangeOutlined fontSize="small" />
                    </MenuIconButton>
                </Box>
                <Popover
                    anchorEl={dateRangeAnchorElement}
                    anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
                    onClose={closeDateRange}
                    open={isDateRangeOpen}
                >
                    <Stack spacing={1.5} sx={{ p: 2 }}>
                        <Stack spacing={0.75}>
                            <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">From (local time)</Typography>
                            <TextField onChange={handleStartChange} size="small" slotProps={{ htmlInput: { 'aria-label': 'Range start local time' } }} type="datetime-local" value={localDateTimeValue(controls.startUtc)} />
                        </Stack>
                        <Stack spacing={0.75}>
                            <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">To (local time)</Typography>
                            <TextField onChange={handleEndChange} size="small" slotProps={{ htmlInput: { 'aria-label': 'Range end local time' } }} type="datetime-local" value={localDateTimeValue(controls.endUtc)} />
                        </Stack>
                    </Stack>
                </Popover>
            </Section>
            <Divider flexItem orientation="vertical" sx={{ my: 1.5 }} />
            <Section label="Export">
                <MenuIconButton disabled={disabled || rows.length === 0} label="Export CSV" onClick={handleExport}>
                    <FileDownloadOutlined fontSize="small" />
                </MenuIconButton>
            </Section>
        </Tab>
    );
}

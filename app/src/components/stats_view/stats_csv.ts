import type { StatsChartRow, StatsDataset } from '../../services/stats/project_stats_types';

const CSV_COLUMNS = [
    'dataset',
    'chart_role',
    'available',
    'grouping',
    'utc_bucket_start',
    'utc_bucket_end',
    'identity',
    'provider',
    'limit_id',
    'window_id',
    'agent',
    'action_type',
    'action_id',
    'series_identity',
    'series_label',
    'stack_identity',
    'display_label',
    'metric',
    'unit',
    'value',
    'numerator',
    'denominator',
    'sample_count',
    'completed_count',
    'failed_count',
    'cancelled_count',
    'aggregation',
    'deviation',
];

function csvValue(value: boolean | number | string) {
    const text = String(value);

    return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeStatsCsv(dataset: StatsDataset, rows: StatsChartRow[]) {
    const records = rows.map((row) => [
        dataset,
        row.chartRole,
        row.available,
        row.grouping,
        row.utcBucketStart ?? '',
        row.utcBucketEnd ?? '',
        row.identity,
        row.provider ?? '',
        row.limitId ?? '',
        row.windowId ?? '',
        row.agent ?? '',
        row.actionType ?? '',
        row.actionId ?? '',
        row.seriesIdentity ?? '',
        row.seriesLabel ?? '',
        row.stackIdentity ?? '',
        row.displayLabel,
        row.metric,
        row.unit,
        row.value,
        row.numerator ?? '',
        row.denominator ?? '',
        row.sampleCount ?? '',
        row.statusCounts?.completed ?? '',
        row.statusCounts?.failed ?? '',
        row.statusCounts?.cancelled ?? '',
        row.aggregation ?? '',
        row.deviation ?? '',
    ]);

    return `${[CSV_COLUMNS, ...records].map((record) => record.map(csvValue).join(',')).join('\r\n')}\r\n`;
}

/** Downloads generated stats CSV without writing repository files. */
export function downloadStatsCsv(dataset: StatsDataset, rows: StatsChartRow[]) {
    const blob = new Blob([serializeStatsCsv(dataset, rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.download = `md2-stats-${dataset}.csv`;
    anchor.href = url;
    anchor.click();
    URL.revokeObjectURL(url);
}

import type { StatsChartRow, StatsDataset } from '../../services/stats/project_stats_service'

const CSV_COLUMNS = ['dataset', 'grouping', 'utc_bucket_start', 'identity', 'display_label', 'metric', 'unit', 'value']

function csvValue(value: string | number) {
    const text = String(value)

    return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function serializeStatsCsv(dataset: StatsDataset, rows: StatsChartRow[]) {
    const records = rows.map((row) => [
        dataset,
        row.grouping,
        row.utcBucketStart ?? '',
        row.identity,
        row.displayLabel,
        row.metric,
        row.unit,
        row.value,
    ])

    return `${[CSV_COLUMNS, ...records].map((record) => record.map(csvValue).join(',')).join('\r\n')}\r\n`
}

/** Downloads generated stats CSV without writing repository files. */
export function downloadStatsCsv(dataset: StatsDataset, rows: StatsChartRow[]) {
    const blob = new Blob([serializeStatsCsv(dataset, rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.download = `md2-stats-${dataset === 'activityOverTime' ? 'activity' : 'totals'}.csv`
    anchor.href = url
    anchor.click()
    URL.revokeObjectURL(url)
}

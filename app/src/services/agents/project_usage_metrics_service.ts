import type { ProjectReference, StorageService } from '../../data/data_types'
import { register } from '../service_injector'

export interface UsageMetricsTokenRow {
    recordedAt: string
    totalTokens: number
}

export interface ProjectUsageMetricsSnapshot {
    available: boolean
    tokenRows: UsageMetricsTokenRow[]
    warnings: string[]
}

const USAGE_METRICS_FILE = 'usage_metrics.csv'
const SUPPORTED_PROVIDERS = new Set(['claude', 'codex'])
const METRICS_COLUMNS = [
    'recorded_at',
    'record_type',
    'provider',
    'limit_id',
    'window_id',
    'window_duration_minutes',
    'resets_at',
    'input_tokens',
    'cached_input_tokens',
    'output_tokens',
    'reasoning_tokens',
    'total_tokens',
    'used_percent',
    'used_percent_delta',
]
const TOKEN_COLUMNS = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_tokens', 'total_tokens']
const EMPTY_SNAPSHOT: ProjectUsageMetricsSnapshot = { available: false, tokenRows: [], warnings: [] }

function normalizePath(path: string) {
    return path.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
}

function joinPath(folder: string, fileName: string) {
    const normalizedFolder = normalizePath(folder)

    return normalizedFolder ? `${normalizedFolder}/${fileName}` : fileName
}

function isValidIsoTimestamp(value: string) {
    const milliseconds = Date.parse(value)

    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
}

function parseNonNegativeInteger(value: string, field: string, rowNumber: number) {
    if (!/^\d+$/u.test(value)) throw new Error(`Invalid usage metrics ${field} at row ${rowNumber}`)
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid usage metrics ${field} at row ${rowNumber}`)

    return parsed
}

function parseCsvRecords(content: string) {
    const records: string[][] = []
    let fields: string[] = []
    let field = ''
    let inQuotes = false
    let afterQuote = false

    for (let index = 0; index < content.length; index += 1) {
        const character = content[index]
        if (inQuotes) {
            if (character !== '"') {
                field += character
                continue
            }
            if (content[index + 1] === '"') {
                field += '"'
                index += 1
                continue
            }
            inQuotes = false
            afterQuote = true
            continue
        }
        if (afterQuote) {
            if (character === ',') {
                fields.push(field)
                field = ''
                afterQuote = false
                continue
            }
            if (character === '\r' || character === '\n') {
                records.push([...fields, field])
                if (character === '\r' && content[index + 1] === '\n') index += 1
                fields = []
                field = ''
                afterQuote = false
                continue
            }
            throw new Error('Malformed usage metrics CSV')
        }
        if (character === '"') {
            if (field.length > 0) throw new Error('Malformed usage metrics CSV')
            inQuotes = true
            continue
        }
        if (character === ',') {
            fields.push(field)
            field = ''
            continue
        }
        if (character === '\r' || character === '\n') {
            records.push([...fields, field])
            if (character === '\r' && content[index + 1] === '\n') index += 1
            fields = []
            field = ''
            continue
        }
        field += character
    }
    if (inQuotes) throw new Error('Malformed usage metrics CSV')
    if (fields.length > 0 || field.length > 0 || afterQuote) records.push([...fields, field])

    return records
}

function isValidAccountUsageRecord(record: Record<string, string>) {
    if (!SUPPORTED_PROVIDERS.has(record.provider) || !record.limit_id || !record.window_id) return false
    if (!isValidIsoTimestamp(record.recorded_at) || !isValidIsoTimestamp(record.resets_at)) return false
    if (!Number.isFinite(Number(record.window_duration_minutes)) || Number(record.window_duration_minutes) <= 0) return false
    if (!Number.isFinite(Number(record.used_percent))) return false
    if (record.used_percent_delta !== '' && !Number.isFinite(Number(record.used_percent_delta))) return false

    return TOKEN_COLUMNS.every((column) => record[column] === '')
}

export function parseUsageMetrics(content: string): Omit<ProjectUsageMetricsSnapshot, 'available'> {
    const records = parseCsvRecords(content)
    const header = records[0]
    if (!header || header.length !== METRICS_COLUMNS.length || header.some((value, index) => value !== METRICS_COLUMNS[index])) {
        throw new Error('Invalid usage metrics CSV header')
    }

    const tokenRows: UsageMetricsTokenRow[] = []
    const warnings: string[] = []
    for (const [index, fields] of records.slice(1).entries()) {
        const rowNumber = index + 2
        const recordType = fields[1]
        if (recordType === 'account_usage') {
            const record = fields.length === METRICS_COLUMNS.length
                ? Object.fromEntries(METRICS_COLUMNS.map((column, columnIndex) => [column, fields[columnIndex]]))
                : null
            if (!record || !isValidAccountUsageRecord(record)) warnings.push(`Malformed account_usage row ${rowNumber} was skipped.`)
            continue
        }
        if (fields.length !== METRICS_COLUMNS.length) throw new Error(`Invalid usage metrics column count at row ${rowNumber}`)
        const record = Object.fromEntries(METRICS_COLUMNS.map((column, columnIndex) => [column, fields[columnIndex]]))
        if (!isValidIsoTimestamp(record.recorded_at)) throw new Error(`Invalid usage metrics recorded_at at row ${rowNumber}`)
        if (record.record_type !== 'token_usage') throw new Error(`Invalid usage metrics record_type at row ${rowNumber}`)
        if (!SUPPORTED_PROVIDERS.has(record.provider)) throw new Error(`Invalid usage metrics provider at row ${rowNumber}`)
        const inputTokens = parseNonNegativeInteger(record.input_tokens, 'input_tokens', rowNumber)
        const cachedInputTokens = parseNonNegativeInteger(record.cached_input_tokens, 'cached_input_tokens', rowNumber)
        const outputTokens = parseNonNegativeInteger(record.output_tokens, 'output_tokens', rowNumber)
        const reasoningTokens = parseNonNegativeInteger(record.reasoning_tokens, 'reasoning_tokens', rowNumber)
        const totalTokens = parseNonNegativeInteger(record.total_tokens, 'total_tokens', rowNumber)
        if (inputTokens + cachedInputTokens + outputTokens + reasoningTokens !== totalTokens) {
            throw new Error(`Inconsistent usage metrics total_tokens at row ${rowNumber}`)
        }
        tokenRows.push({ recordedAt: record.recorded_at, totalTokens })
    }

    return { tokenRows, warnings }
}

/** Owns repository usage-metrics discovery, parsing, and warning state. */
export class ProjectUsageMetricsService {
    private snapshot = EMPTY_SNAPSHOT

    getSnapshot() {
        return this.snapshot
    }

    clear() {
        this.snapshot = EMPTY_SNAPSHOT
    }

    async load(project: ProjectReference, projectFolder: string, storage: StorageService, repositoryFiles: string[]) {
        const path = joinPath(projectFolder, USAGE_METRICS_FILE)
        if (!repositoryFiles.map(normalizePath).includes(path)) {
            this.snapshot = EMPTY_SNAPSHOT
            return this.snapshot
        }
        if (!storage.loadTextFile) throw new Error('Repository text file loading is not available')

        const file = await storage.loadTextFile(project, path)
        const parsed = parseUsageMetrics(file.content)
        this.snapshot = { ...parsed, available: true }

        return this.snapshot
    }
}

export const projectUsageMetricsService = register('projectUsageMetricsService', new ProjectUsageMetricsService())

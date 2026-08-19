import type { ProjectReference, StorageService } from '../../data/data_types'
import {
    calculateActivityStatsFromSources,
    type ActivityStatsCalculationResult,
    type ActivityStatsSource,
} from '../../../../shared/project_stats.mjs'

interface WorkerResponse {
    error?: string
    result?: ActivityStatsCalculationResult
}

type WorkerFactory = () => Worker

function defaultWorkerFactory() {
    return new Worker(new URL('./project_stats_worker.ts', import.meta.url), { type: 'module' })
}

function abortError() {
    return new DOMException('Stats calculation cancelled', 'AbortError')
}

export function calculateActivityStatsInBrowser(
    sources: ActivityStatsSource[],
    signal: AbortSignal,
    workerFactory: WorkerFactory = defaultWorkerFactory,
) {
    if (signal.aborted) return Promise.reject(abortError())
    const worker = workerFactory()

    return new Promise<ActivityStatsCalculationResult>((resolve, reject) => {
        function finish() {
            signal.removeEventListener('abort', handleAbort)
            worker.terminate()
        }
        function handleAbort() {
            finish()
            reject(abortError())
        }
        worker.onerror = (event) => {
            finish()
            reject(new Error(event.message))
        }
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            finish()
            if (event.data.error) {
                reject(new Error(event.data.error))
                return
            }
            if (!event.data.result) {
                reject(new Error('Stats worker returned no result'))
                return
            }
            resolve(event.data.result)
        }
        signal.addEventListener('abort', handleAbort, { once: true })
        worker.postMessage({ sources })
    })
}

async function loadBrowserSources(storage: StorageService, project: ProjectReference, paths: string[]) {
    if (!storage.loadTextFile) throw new Error('Repository text file loading is not available')
    const settledFiles = await Promise.allSettled(paths.map((path) => storage.loadTextFile?.(project, path)))
    const sources: ActivityStatsSource[] = []
    const warnings: string[] = []
    for (const [index, result] of settledFiles.entries()) {
        const path = paths[index]
        if (result.status === 'fulfilled' && result.value) {
            sources.push({ content: result.value.content, path })
            continue
        }
        const detail = result.status === 'rejected' && result.reason instanceof Error
            ? result.reason.message
            : 'file could not be loaded'
        warnings.push(`${path}: ${detail}`)
    }

    return { sources, warnings }
}

export async function calculateActivityStatsOutsideMainThread(
    storage: StorageService,
    project: ProjectReference,
    paths: string[],
    signal: AbortSignal,
) {
    const calculationId = crypto.randomUUID()
    if (storage.calculateActivityStats) {
        const handleAbort = () => {
            if (storage.cancelActivityStatsCalculation) void storage.cancelActivityStatsCalculation(calculationId)
        }
        signal.addEventListener('abort', handleAbort, { once: true })
        try {
            return await storage.calculateActivityStats(project, paths, calculationId)
        } finally {
            signal.removeEventListener('abort', handleAbort)
        }
    }
    const { sources, warnings } = await loadBrowserSources(storage, project, paths)
    if (signal.aborted) throw abortError()
    const calculated = typeof Worker === 'undefined'
        ? calculateActivityStatsFromSources(sources)
        : await calculateActivityStatsInBrowser(sources, signal)

    return { stats: calculated.stats, warnings: [...warnings, ...calculated.warnings] }
}

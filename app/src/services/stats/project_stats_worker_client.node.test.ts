import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProjectReference, StorageService } from '../../data/data_types'
import { calculateActivityStatsInBrowser, calculateActivityStatsOutsideMainThread } from './project_stats_worker_client'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u

/** Replaces the global crypto with the insecure-context shape: getRandomValues but no randomUUID. */
function stubInsecureCrypto() {
    const { getRandomValues } = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: getRandomValues.bind(globalThis.crypto) })
}

interface TestWorker {
    onerror: ((event: ErrorEvent) => void) | null
    onmessage: ((event: MessageEvent) => void) | null
    postMessage: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
}

function worker(): TestWorker {
    return {
        onerror: null,
        onmessage: null,
        postMessage: vi.fn(),
        terminate: vi.fn(),
    }
}

describe('browser project stats worker client', () => {
    it('publishes worker result and terminates worker', async () => {
        const statsWorker = worker()
        const calculation = calculateActivityStatsInBrowser([], new AbortController().signal, () => statsWorker as unknown as Worker)
        statsWorker.onmessage?.({ data: { result: { stats: { actions: [], conversations: [] }, warnings: [] } } } as MessageEvent)

        await expect(calculation).resolves.toEqual({ stats: { actions: [], conversations: [] }, warnings: [] })
        expect(statsWorker.postMessage).toHaveBeenCalledWith({ sources: [] })
        expect(statsWorker.terminate).toHaveBeenCalledTimes(1)
    })

    it('terminates worker when calculation is cancelled', async () => {
        const statsWorker = worker()
        const abortController = new AbortController()
        const calculation = calculateActivityStatsInBrowser([], abortController.signal, () => statsWorker as unknown as Worker)
        const rejection = expect(calculation).rejects.toThrow('Stats calculation cancelled')

        abortController.abort()

        await rejection
        expect(statsWorker.terminate).toHaveBeenCalledTimes(1)
    })
})

describe('activity stats calculation identifier', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('starts and cancels a desktop calculation with one identifier when randomUUID is unavailable', async () => {
        stubInsecureCrypto()
        const abortController = new AbortController()
        let startedId = ''
        const cancelActivityStatsCalculation = vi.fn(async () => {})
        const storage = {
            calculateActivityStats: vi.fn(async (_project: ProjectReference, _paths: string[], calculationId: string) => {
                startedId = calculationId
                abortController.abort()

                return { stats: { actions: [], conversations: [] }, warnings: [] }
            }),
            cancelActivityStatsCalculation,
        } as unknown as StorageService

        const result = await calculateActivityStatsOutsideMainThread(
            storage,
            { name: 'project' } as unknown as ProjectReference,
            [],
            abortController.signal,
        )

        expect(result).toEqual({ stats: { actions: [], conversations: [] }, warnings: [] })
        expect(startedId).toMatch(UUID_PATTERN)
        expect(cancelActivityStatsCalculation).toHaveBeenCalledWith(startedId)
    })
})

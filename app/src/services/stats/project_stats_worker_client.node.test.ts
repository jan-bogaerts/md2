import { describe, expect, it, vi } from 'vitest'
import { calculateActivityStatsInBrowser } from './project_stats_worker_client'

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

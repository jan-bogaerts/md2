/// <reference lib="webworker" />

import { calculateActivityStatsFromSources, type ActivityStatsSource } from '../../../../shared/project_stats.mjs'

interface StatsWorkerRequest {
    sources: ActivityStatsSource[]
}

function handleMessage(event: MessageEvent<StatsWorkerRequest>) {
    try {
        self.postMessage({ result: calculateActivityStatsFromSources(event.data.sources) })
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error) })
    }
}

self.addEventListener('message', handleMessage)

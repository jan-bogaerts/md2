interface ConcurrentMapState<Input, Output> {
    index: number
    items: Input[]
    results: Output[]
}

async function runConcurrentMapWorker<Input, Output>(
    state: ConcurrentMapState<Input, Output>,
    mapper: (item: Input, index: number) => Promise<Output>,
) {
    while (state.index < state.items.length) {
        const currentIndex = state.index
        state.index += 1
        state.results[currentIndex] = await mapper(state.items[currentIndex], currentIndex)
    }
}

/** Maps items with a fixed upper bound on in-flight async work while preserving result order. */
export async function mapWithConcurrency<Input, Output>(
    items: Input[],
    concurrency: number,
    mapper: (item: Input, index: number) => Promise<Output>,
) {
    if (concurrency < 1) throw new Error('Concurrency must be at least 1')

    const workerCount = Math.min(concurrency, items.length)
    const state: ConcurrentMapState<Input, Output> = { index: 0, items, results: [] }
    const workers = Array.from({ length: workerCount }, () => runConcurrentMapWorker(state, mapper))
    await Promise.all(workers)

    return state.results
}

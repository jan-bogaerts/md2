import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './concurrency'

function waitForWorkerTurn() {
    return new Promise((resolve) => {
        window.setTimeout(resolve, 0)
    })
}

function createDeferred<T>() {
    let resolveDeferred: (value: T) => void = () => undefined
    const promise = new Promise<T>((resolve) => {
        resolveDeferred = resolve
    })

    return { promise, resolve: resolveDeferred }
}

describe('mapWithConcurrency', () => {
    it('limits in-flight work and preserves result order', async () => {
        const gates = [createDeferred<string>(), createDeferred<string>(), createDeferred<string>()]
        const started: number[] = []
        const mapped = mapWithConcurrency([0, 1, 2], 2, async (item) => {
            started.push(item)

            return gates[item].promise
        })

        await waitForWorkerTurn()
        expect(started).toEqual([0, 1])

        gates[1].resolve('one')
        await waitForWorkerTurn()
        expect(started).toEqual([0, 1, 2])

        gates[2].resolve('two')
        gates[0].resolve('zero')

        await expect(mapped).resolves.toEqual(['zero', 'one', 'two'])
    })

    it('rejects when one mapped item rejects', async () => {
        await expect(mapWithConcurrency([1, 2], 2, async (item) => {
            if (item === 2) throw new Error('failed item')

            return item
        })).rejects.toThrow('failed item')
    })
})

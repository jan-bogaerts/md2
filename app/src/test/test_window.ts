import { MemoryStorage } from './memory_storage'

export class TestWindow extends EventTarget {
    readonly btoa = globalThis.btoa
    readonly localStorage = new MemoryStorage()
    readonly sessionStorage = new MemoryStorage()
    private readonly timerApi = globalThis

    clearInterval(intervalId?: number) {
        this.timerApi.clearInterval(intervalId)
    }

    clearTimeout(timeoutId?: number) {
        this.timerApi.clearTimeout(timeoutId)
    }

    setInterval(handler: (...arguments_: unknown[]) => void, timeout?: number, ...arguments_: unknown[]) {
        return this.timerApi.setInterval(handler, timeout, ...arguments_)
    }

    setTimeout(handler: (...arguments_: unknown[]) => void, timeout?: number, ...arguments_: unknown[]) {
        return this.timerApi.setTimeout(handler, timeout, ...arguments_)
    }
}

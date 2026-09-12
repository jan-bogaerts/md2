import { afterEach, describe, expect, it, vi } from 'vitest'
import { MobileBackDismissService } from './mobile_back_dismiss_service'

interface TestHistory {
    go: ReturnType<typeof vi.fn>
    pushState: ReturnType<typeof vi.fn>
}

const originalWindow = window

function installTestWindow() {
    const popStateHandlers: Array<() => void> = []
    const history: TestHistory = { go: vi.fn(), pushState: vi.fn() }
    const testWindow = {
        addEventListener: (type: string, handler: () => void) => {
            if (type === 'popstate') popStateHandlers.push(handler)
        },
        history,
    }
    Object.defineProperty(globalThis, 'window', { configurable: true, value: testWindow, writable: true })

    return {
        history,
        pressBack: () => popStateHandlers.forEach((handler) => handler()),
    }
}

async function flushMicrotasks() {
    await Promise.resolve()
}

describe('MobileBackDismissService', () => {
    afterEach(() => {
        Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow, writable: true })
    })

    it('claims one history entry per registration without changing the URL', () => {
        const { history } = installTestWindow()
        const service = new MobileBackDismissService()

        service.register('first', vi.fn())
        service.register('second', vi.fn())

        expect(history.pushState.mock.calls).toEqual([
            [{ md2BackDismiss: 'first' }, ''],
            [{ md2BackDismiss: 'second' }, ''],
        ])
        expect(service.getRegistrationCount()).toBe(2)
    })

    it('dismisses only the top registration on back and pushes a replacement entry', () => {
        const { history, pressBack } = installTestWindow()
        const service = new MobileBackDismissService()
        const dismissFirst = vi.fn()
        const dismissSecond = vi.fn()
        service.register('first', dismissFirst)
        service.register('second', dismissSecond)
        history.pushState.mockClear()

        pressBack()

        expect(dismissSecond).toHaveBeenCalledTimes(1)
        expect(dismissFirst).not.toHaveBeenCalled()
        expect(history.pushState.mock.calls).toEqual([[{ md2BackDismiss: 'second' }, '']])
        expect(service.getRegistrationCount()).toBe(2)
    })

    it('keeps the registration when a dismissal request leaves the surface open', () => {
        const { pressBack } = installTestWindow()
        const service = new MobileBackDismissService()
        const dismiss = vi.fn()
        service.register('dialog', dismiss)

        pressBack()
        pressBack()

        expect(dismiss).toHaveBeenCalledTimes(2)
        expect(service.getRegistrationCount()).toBe(1)
    })

    it('ignores back when nothing is registered', async () => {
        const { history, pressBack } = installTestWindow()
        const service = new MobileBackDismissService()
        const dismiss = vi.fn()
        service.register('popup', dismiss)
        service.unregister('popup')
        await flushMicrotasks()
        history.pushState.mockClear()
        history.go.mockClear()

        pressBack()

        expect(dismiss).not.toHaveBeenCalled()
        expect(history.pushState).not.toHaveBeenCalled()
        expect(history.go).not.toHaveBeenCalled()
    })

    it('collapses several unregistrations into one history move', async () => {
        const { history } = installTestWindow()
        const service = new MobileBackDismissService()
        service.register('first', vi.fn())
        service.register('second', vi.fn())
        service.register('third', vi.fn())

        service.unregister('first')
        service.unregister('second')
        service.unregister('third')
        await flushMicrotasks()

        expect(history.go.mock.calls).toEqual([[-3]])
        expect(service.getRegistrationCount()).toBe(0)
    })

    it('does not dismiss anything for the back event caused by its own unwinding', async () => {
        const { history, pressBack } = installTestWindow()
        const service = new MobileBackDismissService()
        const dismissRemaining = vi.fn()
        service.register('remaining', dismissRemaining)
        service.register('closing', vi.fn())

        service.unregister('closing')
        await flushMicrotasks()
        history.pushState.mockClear()
        pressBack()

        expect(dismissRemaining).not.toHaveBeenCalled()
        expect(history.pushState).not.toHaveBeenCalled()
    })

    it('rejects an empty or duplicate registration ID', () => {
        installTestWindow()
        const service = new MobileBackDismissService()
        service.register('popup', vi.fn())

        expect(() => service.register('', vi.fn())).toThrow('without an ID')
        expect(() => service.register('popup', vi.fn())).toThrow('already registered')
    })
})

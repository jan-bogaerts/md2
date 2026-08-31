import { afterEach, describe, expect, it, vi } from 'vitest'
import { KeyboardShortcutService, type KeyboardShortcutBinding } from './keyboard_shortcut_service'

function setPlatform(platform: string) {
    vi.stubGlobal('navigator', { userAgent: platform, userAgentData: { platform } })
}

function createKeyboardEvent(key: string, modifiers: Partial<Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {}) {
    const event = new Event('keydown', { cancelable: true })
    const keyboardValues = { altKey: false, ctrlKey: false, key, metaKey: false, shiftKey: false, ...modifiers }
    Object.defineProperties(event, Object.fromEntries(
        Object.entries(keyboardValues).map(([name, value]) => [name, { configurable: true, value }]),
    ))

    return event as KeyboardEvent
}

function createBinding(run = vi.fn()): KeyboardShortcutBinding {
    return { alt: false, id: 'global-search', key: 'f', mod: true, run, shift: true }
}

describe('KeyboardShortcutService', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('attaches on first registration and detaches after last unregister', () => {
        setPlatform('Windows')
        const target = new EventTarget()
        const addEventListener = vi.spyOn(target, 'addEventListener')
        const removeEventListener = vi.spyOn(target, 'removeEventListener')
        vi.stubGlobal('window', target)
        const service = new KeyboardShortcutService()

        const unregisterFirst = service.register(createBinding())
        const unregisterSecond = service.register({ ...createBinding(), id: 'other' })
        expect(addEventListener).toHaveBeenCalledTimes(1)

        unregisterFirst()
        expect(removeEventListener).not.toHaveBeenCalled()
        unregisterSecond()
        expect(removeEventListener).toHaveBeenCalledTimes(1)
    })

    it('maps mod to Ctrl on Windows and compares keys case-insensitively', () => {
        setPlatform('Windows')
        const target = new EventTarget()
        vi.stubGlobal('window', target)
        const run = vi.fn()
        const service = new KeyboardShortcutService()
        service.register(createBinding(run))
        const event = createKeyboardEvent('F', { ctrlKey: true, shiftKey: true })

        target.dispatchEvent(event)

        expect(event.defaultPrevented).toBe(true)
        expect(run).toHaveBeenCalledOnce()
    })

    it('maps mod to Meta on Apple platforms', () => {
        setPlatform('macOS')
        const target = new EventTarget()
        vi.stubGlobal('window', target)
        const run = vi.fn()
        const service = new KeyboardShortcutService()
        service.register(createBinding(run))

        target.dispatchEvent(createKeyboardEvent('f', { ctrlKey: true, shiftKey: true }))
        const metaEvent = createKeyboardEvent('f', { metaKey: true, shiftKey: true })
        target.dispatchEvent(metaEvent)

        expect(metaEvent.defaultPrevented).toBe(true)
        expect(run).toHaveBeenCalledOnce()
    })

    it('requires the exact modifier set', () => {
        setPlatform('Windows')
        const target = new EventTarget()
        vi.stubGlobal('window', target)
        const run = vi.fn()
        const service = new KeyboardShortcutService()
        service.register(createBinding(run))
        const events = [
            createKeyboardEvent('f', { ctrlKey: true }),
            createKeyboardEvent('f', { altKey: true, ctrlKey: true, shiftKey: true }),
            createKeyboardEvent('f', { ctrlKey: true, metaKey: true, shiftKey: true }),
        ]

        events.forEach((event) => target.dispatchEvent(event))

        expect(events.every((event) => !event.defaultPrevented)).toBe(true)
        expect(run).not.toHaveBeenCalled()
    })

    it('does not listen before registration or after unregister', () => {
        setPlatform('Windows')
        const target = new EventTarget()
        vi.stubGlobal('window', target)
        const run = vi.fn()
        const service = new KeyboardShortcutService()
        const initialEvent = createKeyboardEvent('f', { ctrlKey: true, shiftKey: true })
        target.dispatchEvent(initialEvent)
        const unregister = service.register(createBinding(run))
        unregister()
        const removedEvent = createKeyboardEvent('f', { ctrlKey: true, shiftKey: true })

        target.dispatchEvent(removedEvent)

        expect(initialEvent.defaultPrevented).toBe(false)
        expect(removedEvent.defaultPrevented).toBe(false)
        expect(run).not.toHaveBeenCalled()
    })

    it('rejects duplicate binding IDs', () => {
        setPlatform('Windows')
        vi.stubGlobal('window', new EventTarget())
        const service = new KeyboardShortcutService()
        const unregister = service.register(createBinding())

        expect(() => service.register(createBinding())).toThrow('Keyboard shortcut already registered: global-search')
        unregister()
    })
})

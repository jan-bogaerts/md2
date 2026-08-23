import { isApplePlatform, type KeyboardShortcut } from './keyboard_platform'
import { register } from '../service_injector'

export interface KeyboardShortcutBinding extends KeyboardShortcut {
    id: string
    run: () => void
}

/** Owns the single window listener used to dispatch application-global shortcuts. */
export class KeyboardShortcutService {
    private readonly bindings = new Map<string, KeyboardShortcutBinding>()

    private listenerTarget: Window | null = null

    private readonly handleKeyDown = (event: KeyboardEvent) => {
        for (const binding of this.bindings.values()) {
            if (!KeyboardShortcutService.matches(event, binding)) continue

            event.preventDefault()
            binding.run()
            return
        }
    }

    private static matches(event: KeyboardEvent, binding: KeyboardShortcut) {
        const applePlatform = isApplePlatform()
        const expectedCtrl = binding.mod && !applePlatform
        const expectedMeta = binding.mod && applePlatform

        return event.key.toLowerCase() === binding.key.toLowerCase()
            && event.ctrlKey === expectedCtrl
            && event.metaKey === expectedMeta
            && event.shiftKey === binding.shift
            && event.altKey === binding.alt
    }

    register(binding: KeyboardShortcutBinding) {
        if (this.bindings.has(binding.id)) throw new Error(`Keyboard shortcut already registered: ${binding.id}`)

        this.bindings.set(binding.id, binding)
        if (this.bindings.size === 1) {
            this.listenerTarget = window
            this.listenerTarget.addEventListener('keydown', this.handleKeyDown)
        }

        return () => {
            if (this.bindings.get(binding.id) !== binding) return

            this.bindings.delete(binding.id)
            if (this.bindings.size === 0 && this.listenerTarget) {
                this.listenerTarget.removeEventListener('keydown', this.handleKeyDown)
                this.listenerTarget = null
            }
        }
    }
}

export const keyboardShortcutService = register('keyboardShortcutService', new KeyboardShortcutService())

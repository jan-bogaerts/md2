import { register } from './service_injector'

const POPSTATE_EVENT = 'popstate'

interface BackDismissRegistration {
    id: string
    onDismiss: () => void
}

/**
 * Owns browser back-button dismissal for surfaces that are full screen on a small screen.
 *
 * Every registration owns one history entry, so a back press pops the entry of the top registration
 * and asks that surface to dismiss itself. A dismissal is a request: the surface decides whether it
 * actually closes, and the entry is only given back when the surface unregisters.
 */
export class MobileBackDismissService {
    private isListening = false
    private pendingUnwindCount = 0
    private queuedUnwindSteps = 0
    private registrations: BackDismissRegistration[] = []
    private unwindFlushScheduled = false

    getRegistrationCount() {
        return this.registrations.length
    }

    /** Claims one history entry for a surface that is currently full screen on a small screen. */
    register(id: string, onDismiss: () => void) {
        if (!id) throw new Error('Cannot register back dismissal without an ID')
        if (this.registrations.some((registration) => registration.id === id)) {
            throw new Error(`Back dismissal is already registered: ${id}`)
        }

        this.startListening()
        this.registrations = [...this.registrations, { id, onDismiss }]
        window.history.pushState({ md2BackDismiss: id }, '')
    }

    /** Returns the history entry of a surface that has actually closed. */
    unregister(id: string) {
        const remaining = this.registrations.filter((registration) => registration.id !== id)
        if (remaining.length === this.registrations.length) return

        this.registrations = remaining
        this.queueUnwindStep()
    }

    private readonly handlePopState = () => {
        if (this.pendingUnwindCount > 0) {
            this.pendingUnwindCount -= 1
            return
        }

        const topRegistration = this.registrations.at(-1)
        if (!topRegistration) return

        topRegistration.onDismiss()
        window.history.pushState({ md2BackDismiss: topRegistration.id }, '')
    }

    private flushUnwindSteps() {
        this.unwindFlushScheduled = false
        const steps = this.queuedUnwindSteps
        this.queuedUnwindSteps = 0
        if (steps === 0) return

        this.pendingUnwindCount += 1
        window.history.go(-steps)
    }

    private queueUnwindStep() {
        this.queuedUnwindSteps += 1
        if (this.unwindFlushScheduled) return

        this.unwindFlushScheduled = true
        queueMicrotask(() => this.flushUnwindSteps())
    }

    private startListening() {
        if (this.isListening) return

        window.addEventListener(POPSTATE_EVENT, this.handlePopState)
        this.isListening = true
    }
}

export const mobileBackDismissService = register('mobileBackDismissService', new MobileBackDismissService())

import {
    getElectronUpdateBridge,
    type ElectronUpdateBridge,
    type UpdateSnapshot,
} from '../data/electron_update_bridge'
import { register } from './service_injector'

type UpdateBridgeProvider = () => ElectronUpdateBridge | null

export const INITIAL_UPDATE_SNAPSHOT: UpdateSnapshot = {
    error: null,
    received: 0,
    state: 'idle',
    total: null,
    version: null,
}

/** Owns renderer update state and scoped Electron update operations. */
export class UpdateService extends EventTarget {
    private bridge: ElectronUpdateBridge | null = null
    private readonly bridgeProvider: UpdateBridgeProvider
    private snapshot = INITIAL_UPDATE_SNAPSHOT
    private unsubscribeChanged: (() => void) | null = null

    constructor(bridgeProvider: UpdateBridgeProvider = getElectronUpdateBridge) {
        super()
        this.bridgeProvider = bridgeProvider
    }

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (callback: () => void) => {
        this.addEventListener('changed', callback)

        return () => this.removeEventListener('changed', callback)
    }

    async start() {
        const bridge = this.bridgeProvider()
        if (!bridge || (bridge === this.bridge && this.unsubscribeChanged)) return

        this.stop()
        this.bridge = bridge
        let changedBeforeRead = false
        this.unsubscribeChanged = bridge.onChanged((snapshot) => {
            if (bridge !== this.bridge) return

            changedBeforeRead = true
            this.update(snapshot)
        })

        try {
            const snapshot = await bridge.getSnapshot()
            if (bridge === this.bridge && !changedBeforeRead) this.update(snapshot)
        } catch {
            // Electron update bridge failures remain silent until user requests installation.
        }
    }

    stop() {
        this.unsubscribeChanged?.()
        this.unsubscribeChanged = null
        this.bridge = null
    }

    dismiss() {
        if (!this.bridge || this.snapshot.state === 'idle') return

        this.update(INITIAL_UPDATE_SNAPSHOT)
        void this.bridge.dismiss()
    }

    async install() {
        if (!this.bridge || !['available', 'error'].includes(this.snapshot.state)) return

        const version = this.snapshot.version
        this.update({ error: null, received: 0, state: 'downloading', total: null, version })
        try {
            await this.bridge.install()
        } catch {
            if (this.snapshot.state !== 'downloading') return

            this.update({
                error: version ? `Could not install version ${version}. Try again.` : 'Could not install update. Try again.',
                received: 0,
                state: 'error',
                total: null,
                version,
            })
        }
    }

    private update(snapshot: UpdateSnapshot) {
        if (snapshot === this.snapshot) return

        this.snapshot = snapshot
        this.dispatchEvent(new CustomEvent<UpdateSnapshot>('changed', { detail: snapshot }))
    }
}

export const updateService = register('updateService', new UpdateService())

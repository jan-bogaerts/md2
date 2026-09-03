import type { RemoteControlConnectionSettings } from '../../data/remote_control_connection'
import { configureRemoteControlConnection, readRemoteControlConnection } from '../../data/remote_control_connection'
import { setActionBridgeOverride } from '../../data/electron_action_bridge'
import { setClaudeRuntimeBridgeOverride } from '../../data/electron_claude_runtime_bridge'
import { setCodexRuntimeBridgeOverride } from '../../data/electron_codex_runtime_bridge'
import { agentCapabilitiesService } from '../agents/agent_capabilities_service'
import { actionRunRegistry } from '../actions/action_run_registry'
import { claudeRateLimitService } from '../agents/claude_rate_limit_service'
import { codexRateLimitService } from '../agents/codex_rate_limit_service'
import { readDesktopConfigFromBridge } from '../config/config_persistence'
import { configService } from '../config/config_service'
import { setDesktopConfigTransportOverride } from '../config/desktop_config_transport'
import { register } from '../service_injector'
import {
    isRemoteControlConnectionError,
    RemoteControlConnectionError,
    RemoteControlStorageService,
} from './remote_control_storage_service'

export type RemoteConnectionStatus = 'connecting' | 'disconnected' | 'ready' | 'reconnecting'

export interface RemoteConnectionSnapshot {
    endpoint: string | null
    errorMessage: string | null
    status: RemoteConnectionStatus
}

export interface RemoteConnectionServiceDependencies {
    activate(storage: RemoteControlStorageService, reconnecting: boolean): Promise<void>
    clearActivation(): void
    createStorage(): RemoteControlStorageService
}

const INITIAL_RECONNECT_DELAY_MS = 1_000
const MAX_RECONNECT_DELAY_MS = 30_000
const INITIAL_SNAPSHOT: RemoteConnectionSnapshot = { endpoint: null, errorMessage: null, status: 'disconnected' }

async function activateRemoteStorage(storage: RemoteControlStorageService, reconnecting: boolean) {
    try {
        const desktopConfig = await storage.loadDesktopConfig()
        configService.replaceDesktopConfig(desktopConfig)
        setActionBridgeOverride(storage)
        setClaudeRuntimeBridgeOverride(storage)
        setCodexRuntimeBridgeOverride(storage)
        setDesktopConfigTransportOverride(storage)
        claudeRateLimitService.start()
        codexRateLimitService.start()
        actionRunRegistry.start()
        if (reconnecting) await actionRunRegistry.recoverConnection()
        await agentCapabilitiesService.reload()
    } catch (error) {
        if (isRemoteControlConnectionError(error)) throw error
        const message = error instanceof Error ? error.message : 'Unknown remote desktop config error'
        throw new Error(`Remote desktop config load failed: ${message}`, { cause: error })
    }
}

function clearRemoteActivation() {
    setActionBridgeOverride(null)
    setClaudeRuntimeBridgeOverride(null)
    setCodexRuntimeBridgeOverride(null)
    setDesktopConfigTransportOverride(null)
    if (!configService.isInitialized()) return

    const desktopConfig = readDesktopConfigFromBridge()
    if (desktopConfig) {
        configService.replaceDesktopConfig(desktopConfig)

        return
    }
    if (configService.hasDesktopConfig()) configService.clearDesktopConfig()
}

const DEFAULT_DEPENDENCIES: RemoteConnectionServiceDependencies = {
    activate: activateRemoteStorage,
    clearActivation: clearRemoteActivation,
    createStorage: () => new RemoteControlStorageService(),
}

function sameSettings(left: RemoteControlConnectionSettings | null, right: RemoteControlConnectionSettings) {
    return left?.endpoint === right.endpoint
}

/** Owns browser-to-desktop connection state, activation order, and reconnection. */
export class RemoteConnectionService extends EventTarget {
    private activeStorage: RemoteControlStorageService | null = null
    private connectingStorage: RemoteControlStorageService | null = null
    private connectionPromise: Promise<RemoteControlStorageService | null> | null = null
    private readonly dependencies: RemoteConnectionServiceDependencies
    private connectionLossCount = 0
    private lifecycleId = 0
    private projectFlowHandled = false
    private projectStorageActive = false
    private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS
    private reconnectResolve: ((storage: RemoteControlStorageService | null) => void) | null = null
    private retryLifecycleId: number | null = null
    private retryStorage: RemoteControlStorageService | null = null
    private retryTimeout: number | null = null
    private settings: RemoteControlConnectionSettings | null = null
    private snapshot = INITIAL_SNAPSHOT
    private unsubscribeConnection: (() => void) | null = null

    constructor(dependencies: RemoteConnectionServiceDependencies = DEFAULT_DEPENDENCIES) {
        super()
        this.dependencies = dependencies
        register('remoteConnectionService', this)
    }

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (listener: () => void) => {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }

    async connect(settings: RemoteControlConnectionSettings): Promise<RemoteControlStorageService> {
        return this.startConnection(settings)
    }

    connectExisting(storage: RemoteControlStorageService) {
        return this.startConnection(storage.getConnectionSettings(), storage)
    }

    connectStored() {
        return this.connect(readRemoteControlConnection())
    }

    private async startConnection(
        settings: RemoteControlConnectionSettings,
        initialStorage?: RemoteControlStorageService,
    ): Promise<RemoteControlStorageService> {
        if (sameSettings(this.settings, settings)) {
            if (this.snapshot.status === 'ready' && this.activeStorage) return this.activeStorage
            if (this.connectionPromise) {
                const storage = await this.connectionPromise
                if (storage) return storage
                throw new RemoteControlConnectionError('Remote-control connection cancelled')
            }
        }

        this.lifecycleId += 1
        const lifecycleId = this.lifecycleId
        this.stopCurrentConnection()
        this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS
        this.projectFlowHandled = false
        this.settings = settings
        this.publish({ endpoint: settings.endpoint, errorMessage: null, status: 'connecting' })
        const connectionPromise = this.connectOnce(settings, lifecycleId, false, initialStorage)
        this.connectionPromise = connectionPromise
        try {
            const storage = await connectionPromise
            if (!storage) throw new RemoteControlConnectionError('Remote-control connection cancelled')
            configureRemoteControlConnection(settings)

            return storage
        } finally {
            if (this.connectionPromise === connectionPromise) this.connectionPromise = null
        }
    }

    disconnect() {
        this.lifecycleId += 1
        this.projectStorageActive = false
        this.projectFlowHandled = false
        this.stopCurrentConnection()
        this.settings = null
        this.dependencies.clearActivation()
        this.publish(INITIAL_SNAPSHOT)
    }

    isProjectStorageActive() {
        return this.projectStorageActive
    }

    setProjectStorageActive(active: boolean) {
        this.projectStorageActive = active
        if (active) this.projectFlowHandled = true
    }

    async runProjectOpenFlow(operation: () => Promise<void>) {
        if (this.projectStorageActive || this.projectFlowHandled) return

        this.projectFlowHandled = true
        await operation()
    }

    private async connectOnce(
        settings: RemoteControlConnectionSettings,
        lifecycleId: number,
        reconnecting: boolean,
        initialStorage?: RemoteControlStorageService,
    ): Promise<RemoteControlStorageService | null> {
        const storage = initialStorage ?? this.dependencies.createStorage()
        if (!initialStorage) storage.init(settings)
        this.connectingStorage = storage
        const connectionLossCount = this.connectionLossCount
        const unsubscribe = reconnecting
            ? null
            : storage.onConnectionChanged((connected) => {
                if (connected) return
                this.connectionLossCount += 1
                if (this.activeStorage === storage && this.snapshot.status === 'ready') this.startReconnecting(lifecycleId)
            })

        try {
            await storage.connect()
            if (connectionLossCount !== this.connectionLossCount) throw new RemoteControlConnectionError('Remote-control connection closed')
            await this.dependencies.activate(storage, reconnecting)
            if (connectionLossCount !== this.connectionLossCount) throw new RemoteControlConnectionError('Remote-control connection closed')
            if (lifecycleId !== this.lifecycleId) {
                if (this.connectingStorage === storage) this.connectingStorage = null
                storage.retire()

                return null
            }

            if (unsubscribe) {
                this.unsubscribeConnection?.()
                this.unsubscribeConnection = unsubscribe
            }
            this.activeStorage = storage
            if (this.connectingStorage === storage) this.connectingStorage = null
            this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS
            this.publish({ endpoint: settings.endpoint, errorMessage: null, status: 'ready' })

            return storage
        } catch (error) {
            if (this.connectingStorage === storage) this.connectingStorage = null
            if (reconnecting) throw error

            unsubscribe?.()
            storage.retire()
            if (lifecycleId !== this.lifecycleId) return null
            this.dependencies.clearActivation()
            const errorMessage = error instanceof Error ? error.message : 'Remote-control connection failed'
            if (!reconnecting) this.publish({ endpoint: settings.endpoint, errorMessage, status: 'disconnected' })
            throw error
        }
    }

    private startReconnecting(lifecycleId: number) {
        if (lifecycleId !== this.lifecycleId || !this.settings) return
        if (this.snapshot.status === 'reconnecting') return

        const storage = this.activeStorage
        if (!storage) return

        this.publish({ endpoint: this.settings.endpoint, errorMessage: null, status: 'reconnecting' })
        const connectionPromise = new Promise<RemoteControlStorageService | null>((resolve) => {
            this.reconnectResolve = resolve
        })
        this.connectionPromise = connectionPromise
        this.retryLifecycleId = lifecycleId
        this.retryStorage = storage
        this.scheduleRetry()
    }

    private scheduleRetry() {
        if (this.retryTimeout !== null || this.retryLifecycleId === null || !this.retryStorage) return

        const delayMs = this.reconnectDelayMs
        this.reconnectDelayMs = Math.min(delayMs * 2, MAX_RECONNECT_DELAY_MS)
        this.retryTimeout = window.setTimeout(() => void this.runRetry(), delayMs)
    }

    private async runRetry() {
        this.retryTimeout = null
        const lifecycleId = this.retryLifecycleId
        const storage = this.retryStorage
        const settings = this.settings
        if (lifecycleId === null || !storage || !settings || lifecycleId !== this.lifecycleId) return

        try {
            const connectedStorage = await this.connectOnce(settings, lifecycleId, true, storage)
            if (!connectedStorage || lifecycleId !== this.lifecycleId) return

            this.reconnectResolve?.(connectedStorage)
            this.clearRetryState()
            if (this.connectionPromise) this.connectionPromise = null
        } catch (error) {
            if (lifecycleId !== this.lifecycleId) return
            const errorMessage = error instanceof Error ? error.message : 'Remote-control reconnection failed'
            this.publish({ endpoint: settings.endpoint, errorMessage, status: 'reconnecting' })
            this.scheduleRetry()
        }
    }

    private stopCurrentConnection() {
        if (this.retryTimeout !== null) window.clearTimeout(this.retryTimeout)
        this.reconnectResolve?.(null)
        this.clearRetryState()
        this.unsubscribeConnection?.()
        this.unsubscribeConnection = null
        const connectingStorage = this.connectingStorage
        const activeStorage = this.activeStorage
        connectingStorage?.retire()
        this.connectingStorage = null
        if (activeStorage !== connectingStorage) activeStorage?.retire()
        this.activeStorage = null
        this.connectionPromise = null
    }

    private clearRetryState() {
        this.retryTimeout = null
        this.retryLifecycleId = null
        this.retryStorage = null
        this.reconnectResolve = null
    }

    private publish(snapshot: RemoteConnectionSnapshot) {
        if (
            this.snapshot.endpoint === snapshot.endpoint
            && this.snapshot.errorMessage === snapshot.errorMessage
            && this.snapshot.status === snapshot.status
        ) return

        this.snapshot = snapshot
        this.dispatchEvent(new Event('changed'))
    }
}

export const remoteConnectionService = new RemoteConnectionService()

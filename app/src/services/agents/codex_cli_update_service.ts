import {
    getElectronCodexRuntimeBridge,
    type CodexUpdateRequired,
    type ElectronCodexRuntimeBridge,
} from '../../data/electron_codex_runtime_bridge'
import { dialogService, type DialogService } from '../dialog_service'
import { register } from '../service_injector'

type CodexRuntimeBridgeProvider = () => ElectronCodexRuntimeBridge | null

/** Owns renderer-wide Codex update warnings and update requests. */
export class CodexCliUpdateService {
    private bridge: ElectronCodexRuntimeBridge | null = null
    private readonly bridgeProvider: CodexRuntimeBridgeProvider
    private readonly dialogs: DialogService
    private unsubscribeUpdateRequired: (() => void) | null = null

    constructor(
        bridgeProvider: CodexRuntimeBridgeProvider = getElectronCodexRuntimeBridge,
        dialogs: DialogService = dialogService,
    ) {
        this.bridgeProvider = bridgeProvider
        this.dialogs = dialogs
        register('codexCliUpdateService', this)
    }

    start() {
        const bridge = this.bridgeProvider()
        if (bridge === this.bridge && this.unsubscribeUpdateRequired) return

        this.stop()
        this.bridge = bridge
        if (!bridge?.onCodexUpdateRequired || !bridge.updateCodexCli) return

        this.unsubscribeUpdateRequired = bridge.onCodexUpdateRequired((update) => this.handleUpdateRequired(bridge, update))
    }

    stop() {
        this.unsubscribeUpdateRequired?.()
        this.unsubscribeUpdateRequired = null
        this.bridge = null
    }

    private handleUpdateRequired(bridge: ElectronCodexRuntimeBridge, update: CodexUpdateRequired) {
        if (bridge !== this.bridge) return
        const { cacheVersion, runningVersion } = update
        if (cacheVersion.length === 0 || runningVersion.length === 0) return

        this.dialogs.warning(
            `Codex CLI ${runningVersion} is incompatible with model cache ${cacheVersion}.`,
            {
                action: {
                    callback: () => this.updateCodex(bridge),
                    label: 'Update Codex',
                },
                title: 'Codex update required',
            },
        )
    }

    private async updateCodex(bridge: ElectronCodexRuntimeBridge) {
        try {
            if (!bridge.updateCodexCli) throw new Error('Codex CLI update is not available')
            await bridge.updateCodexCli()
            this.dialogs.success('Codex updated. Retry the failed action.')
        } catch (error) {
            this.dialogs.error(error, { fallbackMessage: 'Codex update failed' })
            throw error
        }
    }
}

export const codexCliUpdateService = new CodexCliUpdateService()

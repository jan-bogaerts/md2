import { register } from './service_injector'
import { telemetryService } from './telemetry/telemetry_service'

export const DIALOG_SERVICE_EVENT = 'md2:dialog-message'

export type DialogSeverity = 'error' | 'warning' | 'info' | 'success'

export interface DialogServiceAction {
    callback(): Promise<void> | void
    label: string
}

export interface DialogServiceMessage {
    action?: DialogServiceAction
    critical: boolean
    id: number
    message: string
    severity: DialogSeverity
    title: string
}

export interface DialogServiceOptions {
    action?: DialogServiceAction
    critical?: boolean
    fallbackMessage?: string
    title?: string
}

const DEFAULT_TITLES: Record<DialogSeverity, string> = {
    error: 'Error',
    info: 'Information',
    success: 'Success',
    warning: 'Warning',
}

function messageFrom(value: unknown, fallbackMessage: string) {
    if (value instanceof Error && value.message.length > 0) return value.message
    if (typeof value === 'string' && value.length > 0) return value

    return fallbackMessage
}

/** Central notification service for user-visible messages and blocking dialogs. */
export class DialogService extends EventTarget {
    private nextId = 1

    constructor() {
        super()
        register('dialogService', this)
    }

    error(error: unknown, options: DialogServiceOptions = {}) {
        telemetryService.captureError(error)
        const message = messageFrom(error, options.fallbackMessage ?? 'An error occurred')

        return this.show('error', message, options)
    }

    warning(message: string, options: DialogServiceOptions = {}) {
        return this.show('warning', message, options)
    }

    info(message: string, options: DialogServiceOptions = {}) {
        return this.show('info', message, options)
    }

    success(message: string, options: DialogServiceOptions = {}) {
        return this.show('success', message, options)
    }

    private show(severity: DialogSeverity, message: string, options: DialogServiceOptions) {
        if (message.length === 0) throw new Error('Dialog message is required')

        const dialogMessage = {
            ...(options.action ? { action: options.action } : {}),
            critical: !!options.critical,
            id: this.nextId,
            message,
            severity,
            title: options.title ?? DEFAULT_TITLES[severity],
        }
        this.nextId += 1
        this.dispatchEvent(new CustomEvent<DialogServiceMessage>(DIALOG_SERVICE_EVENT, { detail: dialogMessage }))

        return dialogMessage
    }
}

export const dialogService = new DialogService()

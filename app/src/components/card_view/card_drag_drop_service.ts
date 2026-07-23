import { register } from '../../services/service_injector'
import type { DropTarget } from './card_drag'

export interface CardDragOverlaySnapshot {
    cardPath: string | null
    width: number | null
}

export interface CardDropPreviewSnapshot {
    dropPreviewHeight: number | null
    dropPreviewIndex: number
}

const CLOSED_OVERLAY_SNAPSHOT: CardDragOverlaySnapshot = { cardPath: null, width: null }

/** Owns transient card drag state and publishes changes only to affected UI leaves. */
export class CardDragDropService {
    private activeCardHeight: number | null = null
    private columnListeners = new Map<string, Set<() => void>>()
    private overlayListeners = new Set<() => void>()
    private overlaySnapshot = CLOSED_OVERLAY_SNAPSHOT
    private previewSnapshot: CardDropPreviewSnapshot | null = null
    private previewStatus: string | null = null

    readonly getOverlaySnapshot = () => this.overlaySnapshot

    getColumnPreview(status: string): CardDropPreviewSnapshot | null {
        return this.previewStatus === status ? this.previewSnapshot : null
    }

    readonly subscribeOverlay = (listener: () => void) => {
        this.overlayListeners.add(listener)

        return () => this.overlayListeners.delete(listener)
    }

    subscribeColumn(status: string, listener: () => void) {
        const listeners = this.columnListeners.get(status) ?? new Set()
        listeners.add(listener)
        this.columnListeners.set(status, listeners)

        return () => {
            listeners.delete(listener)
            if (listeners.size === 0) this.columnListeners.delete(status)
        }
    }

    startDrag(cardPath: string, height: number | null, width: number | null) {
        if (!cardPath) throw new Error('Cannot start card drag without a card path')

        this.clearPreview()
        this.activeCardHeight = height
        this.overlaySnapshot = { cardPath, width }
        this.notifyOverlay()
    }

    setDropPreview(dropTarget: DropTarget | null) {
        if (dropTarget && !this.overlaySnapshot.cardPath) throw new Error('Cannot preview a card drop without an active drag')

        const nextPreview = dropTarget
            ? { dropPreviewHeight: this.activeCardHeight, dropPreviewIndex: dropTarget.targetIndex }
            : null
        if (
            this.previewStatus === dropTarget?.targetStatus
            && this.previewSnapshot?.dropPreviewHeight === nextPreview?.dropPreviewHeight
            && this.previewSnapshot?.dropPreviewIndex === nextPreview?.dropPreviewIndex
        ) return

        const previousStatus = this.previewStatus
        this.previewSnapshot = nextPreview
        this.previewStatus = dropTarget?.targetStatus ?? null
        if (previousStatus) this.notifyColumn(previousStatus)
        if (this.previewStatus && this.previewStatus !== previousStatus) this.notifyColumn(this.previewStatus)
    }

    endDrag() {
        this.clearPreview()
        this.activeCardHeight = null
        if (this.overlaySnapshot === CLOSED_OVERLAY_SNAPSHOT) return

        this.overlaySnapshot = CLOSED_OVERLAY_SNAPSHOT
        this.notifyOverlay()
    }

    private clearPreview() {
        if (!this.previewStatus) return

        const previousStatus = this.previewStatus
        this.previewSnapshot = null
        this.previewStatus = null
        this.notifyColumn(previousStatus)
    }

    private notifyColumn(status: string) {
        for (const listener of this.columnListeners.get(status) ?? []) listener()
    }

    private notifyOverlay() {
        for (const listener of this.overlayListeners) listener()
    }
}

export const cardDragDropService = register('cardDragDropService', new CardDragDropService())

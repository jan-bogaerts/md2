const TARGET_CHANGED_EVENT = 'targetChanged'

export interface DiagramFragmentDialogTarget {
    fragmentId: string | null
}

/** Owns whether sequence-fragment creation or editing dialog is open. */
export class DiagramFragmentDialogService extends EventTarget {
    private target: DiagramFragmentDialogTarget | null = null

    getTargetSnapshot = () => this.target

    subscribeTarget = (listener: () => void) => {
        this.addEventListener(TARGET_CHANGED_EVENT, listener)

        return () => this.removeEventListener(TARGET_CHANGED_EVENT, listener)
    }

    openCreate() {
        if (this.target?.fragmentId === null) return false

        this.target = { fragmentId: null }
        this.dispatchEvent(new Event(TARGET_CHANGED_EVENT))

        return true
    }

    openEdit(fragmentId: string) {
        if (fragmentId.trim().length === 0) throw new Error('Diagram fragment ID is required')
        if (this.target?.fragmentId === fragmentId) return false

        this.target = { fragmentId }
        this.dispatchEvent(new Event(TARGET_CHANGED_EVENT))

        return true
    }

    close() {
        if (!this.target) return false

        this.target = null
        this.dispatchEvent(new Event(TARGET_CHANGED_EVENT))

        return true
    }
}

export const diagramFragmentDialogService = new DiagramFragmentDialogService()

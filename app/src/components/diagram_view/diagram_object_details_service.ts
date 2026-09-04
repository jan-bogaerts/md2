const TARGET_CHANGED_EVENT = 'targetChanged'

export type DiagramDetailsObjectKind = 'edge' | 'group' | 'node'

export interface DiagramObjectDetailsTarget {
    objectId: string
    objectKind: DiagramDetailsObjectKind
}

/** Owns which New-diagram object has its details dialog open. */
export class DiagramObjectDetailsService extends EventTarget {
    private target: DiagramObjectDetailsTarget | null = null

    getTargetSnapshot = () => this.target

    subscribeTarget = (listener: () => void) => {
        this.addEventListener(TARGET_CHANGED_EVENT, listener)

        return () => this.removeEventListener(TARGET_CHANGED_EVENT, listener)
    }

    open(target: DiagramObjectDetailsTarget) {
        if (target.objectId.trim().length === 0) throw new Error('Diagram details object ID is required')
        if (this.target?.objectId === target.objectId && this.target.objectKind === target.objectKind) return false

        this.target = { ...target }
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

export const diagramObjectDetailsService = new DiagramObjectDetailsService()

const TARGET_CHANGED_EVENT = 'targetChanged'

export type DiagramDetailsObjectKind = 'edge' | 'group' | 'node'

interface DiagramObjectTarget {
    objectId: string
    objectKind: DiagramDetailsObjectKind
}

interface DiagramMetadataTarget {
    objectKind: 'meta'
}

export type DiagramObjectDetailsTarget = DiagramMetadataTarget | DiagramObjectTarget

function sameTarget(left: DiagramObjectDetailsTarget | null, right: DiagramObjectDetailsTarget) {
    if (!left || left.objectKind !== right.objectKind) return false
    if (left.objectKind === 'meta' || right.objectKind === 'meta') return true

    return left.objectId === right.objectId
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
        if (target.objectKind !== 'meta' && target.objectId.trim().length === 0) {
            throw new Error('Diagram details object ID is required')
        }
        if (sameTarget(this.target, target)) return false

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

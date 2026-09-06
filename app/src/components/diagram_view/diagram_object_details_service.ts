const TARGET_CHANGED_EVENT = 'targetChanged'

export type DiagramDetailsObjectKind = 'edge' | 'group' | 'node'

interface DiagramObjectTarget {
    objectId: string
    objectKind: DiagramDetailsObjectKind
}

/** Diagram-wide editors addressed by kind alone, because the diagram owns exactly one of each. */
interface DiagramSingletonTarget {
    objectKind: 'legend' | 'meta'
}

export type DiagramObjectDetailsTarget = DiagramSingletonTarget | DiagramObjectTarget

function isSingletonTarget(target: DiagramObjectDetailsTarget): target is DiagramSingletonTarget {
    return target.objectKind === 'legend' || target.objectKind === 'meta'
}

function sameTarget(left: DiagramObjectDetailsTarget | null, right: DiagramObjectDetailsTarget) {
    if (!left || left.objectKind !== right.objectKind) return false
    if (isSingletonTarget(left) || isSingletonTarget(right)) return true

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
        if (!isSingletonTarget(target) && target.objectId.trim().length === 0) {
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

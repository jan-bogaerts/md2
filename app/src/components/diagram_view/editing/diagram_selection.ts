export interface DiagramSelection {
    id: string
    label: string
    left: number
    objectKind: 'edge' | 'node'
    top: number
}

export type DiagramSelectHandler = (selection: DiagramSelection, ctrlKey: boolean) => void

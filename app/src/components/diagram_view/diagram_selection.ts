export interface DiagramSelection {
    id: string
    label: string
    left: number
    top: number
}

export type DiagramSelectHandler = (selection: DiagramSelection, ctrlKey: boolean) => void

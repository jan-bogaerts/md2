import type { DiagramData, DiagramFlowPreset, DiagramType } from './diagram_data'

export type EmptyDiagramChoiceId = 'architecture' | 'dependency' | 'entity' | 'flowchart' | 'sequence' | 'state'

export interface EmptyDiagramChoice {
    description: string
    id: EmptyDiagramChoiceId
    label: string
    preset?: DiagramFlowPreset
    title: string
    type: DiagramType
}

export const EMPTY_DIAGRAM_CHOICES: readonly EmptyDiagramChoice[] = [
    { description: 'New architecture diagram', id: 'architecture', label: 'Architecture', title: 'New architecture', type: 'architecture' },
    { description: 'New dependency diagram', id: 'dependency', label: 'Dependency', title: 'New dependency', type: 'dependency' },
    { description: 'New sequence diagram', id: 'sequence', label: 'Sequence', title: 'New sequence', type: 'sequence' },
    { description: 'New flowchart diagram', id: 'flowchart', label: 'Flowchart', preset: 'flowchart', title: 'New flowchart', type: 'flow' },
    { description: 'New state diagram', id: 'state', label: 'State diagram', preset: 'state', title: 'New state diagram', type: 'flow' },
    { description: 'New entity diagram', id: 'entity', label: 'Entity', title: 'New entity', type: 'entity' },
]

/** Builds canonical persisted data for a new empty diagram. */
export function createEmptyDiagramData(choice: EmptyDiagramChoice): DiagramData {
    return {
        edges: [],
        groups: [],
        meta: {
            description: choice.description,
            ...(choice.preset ? { preset: choice.preset } : {}),
            title: choice.title,
            type: choice.type,
            version: 1,
        },
        nodes: [],
    }
}

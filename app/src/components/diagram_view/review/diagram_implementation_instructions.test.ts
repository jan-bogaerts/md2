import { describe, expect, it } from 'vitest'
import type { DiagramRecord } from '../../../services/diagrams/diagram_index'
import { cardRelativeDiagramPath, diagramImplementationInstructions } from './diagram_implementation_instructions'

const sourceRecord: DiagramRecord = {
    actionId: 'mind-map',
    id: 'diagram-1',
    label: 'Roadmap',
    path: 'projects/demo/diagrams/roadmap.json',
    pendingImplementation: true,
}

describe('diagram implementation instructions', () => {
    it('resolves paths from configured working folder', () => {
        expect(cardRelativeDiagramPath(
            'projects/demo/feature_descriptions',
            'projects/demo/diagrams/roadmap.json',
        )).toBe('../diagrams/roadmap.json')
    })

    it('uses saved copy and places semantic changes below link', () => {
        const savedRecord = {
            ...sourceRecord,
            id: 'diagram-copy',
            path: 'projects/demo/diagrams/roadmap edited.json',
            sourceDiagramId: sourceRecord.id,
        }

        expect(diagramImplementationInstructions(
            'Roadmap',
            '- Add node.',
            sourceRecord,
            savedRecord,
            'projects/demo/feature_descriptions',
        )).toBe('Implement diagram [Roadmap](<../diagrams/roadmap edited.json>).\n\n- Add node.')
    })
})

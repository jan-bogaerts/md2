import { describe, expect, it } from 'vitest'
import { parseDiagramData, serializeDiagramData } from './diagram_data'
import { createEmptyDiagramData, EMPTY_DIAGRAM_CHOICES } from './empty_diagram_factory'

describe('createEmptyDiagramData', () => {
    it.each(EMPTY_DIAGRAM_CHOICES)('creates valid empty $label data', (choice) => {
        const diagram = createEmptyDiagramData(choice)
        const parsed = parseDiagramData(serializeDiagramData(diagram))

        expect(parsed).toEqual(diagram)
        expect(diagram).toMatchObject({
            edges: [],
            groups: [],
            meta: {
                description: choice.description,
                title: choice.title,
                type: choice.type,
                version: 1,
            },
            nodes: [],
        })
        expect(diagram.meta.description.length).toBeGreaterThan(0)
        expect(diagram.meta.title.length).toBeGreaterThan(0)
        expect(diagram).not.toHaveProperty('fragments')
        expect(diagram.meta).not.toHaveProperty('legend')
    })

    it('stores separate flowchart and state presets', () => {
        const flowchart = EMPTY_DIAGRAM_CHOICES.find(({ id }) => id === 'flowchart')
        const state = EMPTY_DIAGRAM_CHOICES.find(({ id }) => id === 'state')
        if (!flowchart || !state) throw new Error('Flow diagram choices are required')

        expect(createEmptyDiagramData(flowchart).meta).toMatchObject({ preset: 'flowchart', type: 'flow' })
        expect(createEmptyDiagramData(state).meta).toMatchObject({ preset: 'state', type: 'flow' })
    })
})

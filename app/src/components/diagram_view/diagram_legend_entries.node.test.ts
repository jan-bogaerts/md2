import { describe, expect, it } from 'vitest'
import { layout } from '../../services/diagrams/diagram_layout'
import { diagramLegendEntries } from './diagram_legend_entries'

describe('diagramLegendEntries', () => {
    it('derives unique canonical roles and kinds in first-appearance order', () => {
        const data = layout({
            edges: [
                { from: 'one', id: 'first', kind: 'async', to: 'two' },
                { from: 'two', id: 'second', kind: 'data', to: 'three' },
                { from: 'three', id: 'third', kind: 'async', to: 'one' },
            ],
            groups: [],
            meta: { description: 'Description', title: 'Title', type: 'architecture', version: 1 },
            nodes: [
                { id: 'one', label: 'One', role: 'store' },
                { id: 'two', label: 'Two', role: 'focal' },
                { id: 'three', label: 'Three', role: 'store' },
            ],
        })

        expect(diagramLegendEntries(data)).toEqual([
            { entryType: 'node', label: 'store', role: 'store' },
            { entryType: 'node', label: 'focal', role: 'focal' },
            { entryType: 'connection', kind: 'async', label: 'async' },
            { entryType: 'connection', kind: 'data', label: 'data' },
        ])
    })
})

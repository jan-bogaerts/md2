import { describe, expect, it } from 'vitest'
import { layout } from '../../services/diagrams/diagram_layout'
import { derivedDiagramLegendEntries, diagramLegendEntries } from './diagram_legend_entries'

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
    it('uses explicit legend entries in stored order instead of deriving them', () => {
        const data = layout({
            edges: [{ from: 'one', id: 'first', kind: 'async', to: 'two' }],
            groups: [],
            meta: {
                description: 'Description',
                legend: [{ kind: 'async', label: 'Fire and forget' }, { label: 'Order service', role: 'focal' }],
                title: 'Title',
                type: 'architecture',
                version: 1,
            },
            nodes: [
                { id: 'one', label: 'One', role: 'store' },
                { id: 'two', label: 'Two', role: 'focal' },
            ],
        })

        expect(diagramLegendEntries(data)).toEqual([
            { entryType: 'connection', kind: 'async', label: 'Fire and forget' },
            { entryType: 'node', label: 'Order service', role: 'focal' },
        ])
    })

    it('derives from supplied roles and kinds, removing duplicates in first-appearance order', () => {
        expect(derivedDiagramLegendEntries(['store', 'focal', 'store'], ['call', 'call', 'return'])).toEqual([
            { entryType: 'node', label: 'store', role: 'store' },
            { entryType: 'node', label: 'focal', role: 'focal' },
            { entryType: 'connection', kind: 'call', label: 'call' },
            { entryType: 'connection', kind: 'return', label: 'return' },
        ])
    })
})

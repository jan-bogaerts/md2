import { describe, expect, it } from 'vitest'
import { layout } from '../../../services/diagrams/diagram_layout'
import { diagramLegendEntries } from './diagram_legend_entries'

describe('diagramLegendEntries', () => {
    it('derives unique Add tool labels for kinds in first-appearance order', () => {
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
            { entryType: 'nodeKind', label: 'Component', nodeKind: 'component', roles: ['store', 'focal'] },
            { entryType: 'connection', kind: 'async', label: 'Async' },
            { entryType: 'connection', kind: 'data', label: 'Data' },
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

    it('keeps distinct flow node kinds despite shared role', () => {
        const data = layout({
            edges: [], groups: [],
            meta: { description: 'Flow', preset: 'flowchart', title: 'Flow', type: 'flow', version: 1 },
            nodes: ['start', 'end', 'step', 'decision'].map((kind, index) => ({ id: `node-${index}`, kind: kind as 'start' | 'end' | 'step' | 'decision', label: `Object ${index}`, role: 'focal' as const })),
        })

        expect(diagramLegendEntries(data).map(({ label }) => label)).toEqual(['Start', 'End', 'Step', 'Decision'])
    })

    it('resolves both mindmap labels even though Add offers one kind at a time', () => {
        const data = layout({
            edges: [{ from: 'root', id: 'link', kind: 'connection', to: 'topic' }], groups: [],
            meta: { description: 'Mindmap', title: 'Mindmap', type: 'mindmap', version: 1 },
            nodes: [
                { id: 'root', kind: 'root', label: 'My idea', role: 'focal' },
                { id: 'topic', kind: 'topic', label: 'My branch', role: 'backend' },
            ],
        })

        expect(diagramLegendEntries(data).map(({ label }) => label)).toEqual(['Root', 'Topic', 'Connection'])
    })

    it('keeps an explicit kind label, role entry, connection label, and order', () => {
        const data = layout({
            edges: [{ from: 'one', id: 'link', kind: 'data', to: 'two' }], groups: [],
            meta: {
                description: 'Architecture', legend: [
                    { kind: 'data', label: 'Sends' },
                    { label: 'Storage', role: 'store' },
                    { label: 'Module', nodeKind: 'component' },
                ], title: 'Architecture', type: 'architecture', version: 1,
            },
            nodes: [
                { id: 'one', label: 'One', role: 'focal' },
                { id: 'two', label: 'Two', role: 'store' },
            ],
        })

        expect(diagramLegendEntries(data)).toEqual([
            { entryType: 'connection', kind: 'data', label: 'Sends' },
            { entryType: 'node', label: 'Storage', role: 'store' },
            { entryType: 'nodeKind', label: 'Module', nodeKind: 'component', roles: ['focal', 'store'] },
        ])
    })
})

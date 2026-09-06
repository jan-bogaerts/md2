import { describe, expect, it } from 'vitest'
import {
    diagramIndexPath,
    emptyDiagramIndex,
    isPathInsideDiagramsFolder,
    parseDiagramIndex,
    serializeDiagramIndex,
    type DiagramIndex,
} from './diagram_index'

function populatedIndex(): DiagramIndex {
    return {
        activePath: ['root-1', 'child-1'],
        children: { 'root-1': { orders: { detail: ['child-1'] } } },
        diagrams: {
            'child-1': {
                actionId: 'detail', id: 'child-1', label: 'Orders',
                parent: { diagramId: 'root-1', itemId: 'orders', itemLabel: 'Orders' },
                path: 'design/diagrams/detail.json',
            },
            'root-1': { actionId: 'overview', id: 'root-1', label: 'Overview', path: 'design/diagrams/root.json' },
        },
        roots: { overview: ['root-1'] },
        version: 1,
    }
}

describe('diagram index', () => {
    it('round-trips edited-copy source provenance for restart loading', () => {
        const index: DiagramIndex = {
            activePath: ['source'],
            children: {},
            diagrams: {
                copy: {
                    actionId: 'overview', id: 'copy', label: 'Overview', path: 'diagrams/overview-edited-copy.json',
                    sourceDiagramId: 'source',
                },
                source: { actionId: 'overview', id: 'source', label: 'Overview', path: 'diagrams/overview.json' },
            },
            roots: { overview: ['source', 'copy'] },
            version: 1,
        }

        expect(parseDiagramIndex(serializeDiagramIndex(index))).toEqual(index)
    })
    it('round-trips versioned root and child records', () => {
        expect(parseDiagramIndex(serializeDiagramIndex(populatedIndex()))).toEqual(populatedIndex())
    })

    it('creates empty normalized state and configured index path', () => {
        expect(emptyDiagramIndex()).toEqual({ activePath: [], children: {}, diagrams: {}, roots: {}, version: 1 })
        expect(diagramIndexPath('design\\custom-diagrams')).toBe('design/custom-diagrams/diagram-view.json')
    })

    it('rejects malformed records and broken parent chains', () => {
        const missingParent = populatedIndex()
        missingParent.diagrams['child-1'] = { ...missingParent.diagrams['child-1'], parent: { diagramId: 'missing', itemId: 'orders', itemLabel: 'Orders' } }

        expect(() => parseDiagramIndex('{')).toThrow('invalid JSON')
        expect(() => parseDiagramIndex(JSON.stringify({ ...populatedIndex(), version: 2 }))).toThrow('unsupported version 2')
        expect(() => serializeDiagramIndex(missingParent)).toThrow('invalid child diagram child-1')
    })

    it('accepts only repository paths below configured diagrams folder', () => {
        expect(isPathInsideDiagramsFolder('design/diagrams/root.json', 'design/diagrams')).toBe(true)
        expect(isPathInsideDiagramsFolder('design/diagrams/../outside.json', 'design/diagrams')).toBe(false)
        expect(isPathInsideDiagramsFolder('design/other/root.json', 'design/diagrams')).toBe(false)
    })
})

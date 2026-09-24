import { describe, expect, it } from 'vitest'
import { curvedDiagramPath, roundedDiagramPath } from './diagram_path'

describe('roundedDiagramPath', () => {
    it('creates rounded commands without moving endpoints', () => {
        expect(roundedDiagramPath([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 20, y: 20 }]))
            .toBe('M 0 0 L 0 12 Q 0 20 8 20 L 20 20')
    })
})

describe('curvedDiagramPath', () => {
    it('creates one quadratic curve without moving endpoints', () => {
        expect(curvedDiagramPath([{ x: 4, y: 8 }, { x: 40, y: 24 }], { x: 20, y: 4 }))
            .toBe('M 4 8 Q 20 4 40 24')
    })
})

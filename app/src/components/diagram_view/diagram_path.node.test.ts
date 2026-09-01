import { describe, expect, it } from 'vitest'
import { roundedDiagramPath } from './diagram_path'

describe('roundedDiagramPath', () => {
    it('creates rounded commands without moving endpoints', () => {
        expect(roundedDiagramPath([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 20, y: 20 }]))
            .toBe('M 0 0 L 0 12 Q 0 20 8 20 L 20 20')
    })
})

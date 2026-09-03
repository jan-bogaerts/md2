import { createTheme } from '@mui/material'
import { describe, expect, it } from 'vitest'
import { diagramEdgeStyle } from './diagram_edge_style'

const theme = createTheme()

describe('diagramEdgeStyle', () => {
    it('returns standard solid filled-arrow appearance', () => {
        expect(diagramEdgeStyle('connection', theme)).toEqual({
            arrowhead: 'filled',
            color: theme.palette.text.secondary,
            strokeWidth: 1.2,
        })
    })

    it('returns dashed and accent appearances by connection kind', () => {
        expect(diagramEdgeStyle('async', theme)).toMatchObject({ arrowhead: 'open', strokeDasharray: '4 3' })
        expect(diagramEdgeStyle('return', theme)).toMatchObject({ arrowhead: 'filled', strokeDasharray: '4 3' })
        expect(diagramEdgeStyle('cycle', theme)).toMatchObject({ color: theme.palette.primary.main, strokeDasharray: '4 3', strokeWidth: 1.5 })
        expect(diagramEdgeStyle('success', theme)).toMatchObject({ color: theme.palette.primary.main, strokeWidth: 1.5 })
    })

    it('uses focused appearance without changing arrow or dash rules', () => {
        expect(diagramEdgeStyle('async', theme, true)).toEqual({
            arrowhead: 'open',
            color: theme.palette.primary.main,
            strokeDasharray: '4 3',
            strokeWidth: 3,
        })
    })
})

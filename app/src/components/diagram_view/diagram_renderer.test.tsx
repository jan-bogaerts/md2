import { ThemeProvider } from '@mui/material'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData, DiagramType } from '../../services/diagrams/diagram_data'
import { layout } from '../../services/diagrams/diagram_layout'
import { createAppTheme } from '../../theme/app_theme'
import { DiagramRenderer } from './diagram_renderer'

function diagram(type: DiagramType): DiagramData {
    const edgeKinds = {architecture: 'connection', dependency: 'dependency', entity: 'relationship', flow: 'flow', sequence: 'call'} as const
    const kinds = type === 'flow' ? ['start', 'end'] as const : [undefined, undefined]

    return {
        edges: [{ from: 'one', id: 'one-two', kind: edgeKinds[type], label: 'connects', to: 'two' }],
        groups: [{ id: 'scope', label: 'Scope', nodeIds: ['one', 'two'] }],
        meta: {
            description: `${type} description`,
            legend: [{ label: 'Focus', role: 'focal' }],
            ...(type === 'flow' ? { preset: 'flowchart' as const } : {}),
            title: `${type} title`,
            type,
            version: 1,
        },
        nodes: [
            {
                ...(type === 'entity' ? { fields: [{ key: 'primary' as const, name: 'id', type: 'UUID' }] } : {}),
                ...(kinds[0] ? { kind: kinds[0] } : {}),
                id: 'one', label: 'One', role: 'focal',
            },
            { ...(kinds[1] ? { kind: kinds[1] } : {}), id: 'two', label: 'Two', role: 'backend' },
        ],
    }
}

function renderDiagram(data: DiagramData, onSelect = vi.fn()) {
    render(
        <ThemeProvider theme={createAppTheme('dark')}>
            <DiagramRenderer data={layout(data)} onSelect={onSelect} />
        </ThemeProvider>,
    )

    return onSelect
}

describe('DiagramRenderer', () => {
    afterEach(cleanup)

    it.each(['architecture', 'dependency', 'sequence', 'flow', 'entity'] as const)('renders supported %s data', (type) => {
        renderDiagram(diagram(type))

        expect(screen.getByRole('heading', { name: `${type} title` })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'One' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'connects' })).toBeInTheDocument()
        expect(screen.getByRole('group', { name: 'Scope' })).toBeInTheDocument()
        expect(screen.getByLabelText('Diagram legend')).toBeInTheDocument()
    })

    it('renders entity fields and owns keyboard edge selection', async () => {
        const onSelect = renderDiagram(diagram('entity'))
        const user = userEvent.setup()
        const edge = screen.getByRole('button', { name: 'connects' })

        expect(screen.getByText('# id: UUID')).toBeInTheDocument()
        edge.focus()
        await user.keyboard('{Enter}')

        expect(onSelect).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ id: 'one-two', label: 'connects' }))
    })

    it('renders dependency fan-in and disables explicit non-drilldown nodes', () => {
        const data = diagram('dependency')
        data.nodes[0].drilldown = false
        renderDiagram(data)

        expect(screen.getByText('1 in')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'One' })).toBeDisabled()
    })
})

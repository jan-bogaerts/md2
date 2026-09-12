import { ThemeProvider } from '@mui/material'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import type { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramEmphasisService } from '../../services/diagrams/diagram_emphasis_service'
import type { DiagramViewService } from '../../services/diagrams/diagram_view_service'
import { createAppTheme } from '../../theme/app_theme'
import { DiagramGroup } from './diagram_group'
import { SequenceActivation } from './sequence_activation'
import { SequenceFragment } from './sequence_fragment'
import { SequenceLifeline } from './sequence_lifeline'

const diagram: DiagramData = {
    edges: [{ from: 'one', id: 'one-two', kind: 'call', to: 'two' }],
    groups: [{ id: 'group', label: 'Group', nodeIds: ['one', 'two'] }],
    meta: { description: 'Sequence', title: 'Sequence', type: 'sequence', version: 1 },
    nodes: [
        { id: 'one', label: 'One', role: 'focal' },
        { id: 'two', label: 'Two', role: 'backend' },
    ],
}

function emphasisService() {
    const view = {
        getSourceSnapshot: () => ({
            diagram,
            record: { actionId: 'action', id: 'diagram', label: 'Diagram', path: 'diagram.json' },
        }),
    } as DiagramViewService
    const service = new DiagramEmphasisService(view, {} as DiagramEditSessionService)
    service.emphasize({ diagramId: 'diagram', objectId: 'one', objectKind: 'node', surface: 'current' })

    return service
}

afterEach(cleanup)

describe('diagram emphasis presentation', () => {
    it('dims groups and every sequence-only decoration', () => {
        const emphasis = emphasisService()
        const { container } = render(
            <ThemeProvider theme={createAppTheme('dark')}>
                <DiagramGroup emphasis={emphasis} group={{ height: 100, id: 'group', label: 'Group', nodeIds: [], width: 100, x: 0, y: 0 }} />
                <SequenceFragment
                    emphasis={emphasis}
                    fragment={{ guardPositions: [], height: 80, id: 'fragment', operator: 'opt', width: 80, x: 0, y: 0 }}
                />
                <SequenceActivation activation={{ height: 60, id: 'activation', width: 8, x: 10, y: 10 }} emphasis={emphasis} />
                <SequenceLifeline emphasis={emphasis} height={100} nodeId="one" x={20} y={20} />
            </ThemeProvider>,
        )

        expect(screen.getByRole('group', { name: 'Group' })).toHaveStyle({ opacity: '0.08' })
        expect(screen.getByRole('group', { name: 'opt fragment' })).toHaveStyle({ opacity: '0.08' })
        const hiddenDecorations = container.querySelectorAll('[aria-hidden="true"]')
        expect(hiddenDecorations).toHaveLength(2)
        hiddenDecorations.forEach((decoration) => expect(decoration).toHaveStyle({ opacity: '0.08' }))
    })
})

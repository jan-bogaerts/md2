import { ThemeProvider } from '@mui/material'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramFlowPreset, DiagramType } from '../../services/diagrams/diagram_data'
import type { PositionedDiagramNode } from '../../services/diagrams/diagram_layout'
import { createAppTheme } from '../../theme/app_theme'
import { DiagramNode } from './diagram_node'

function positioned(overrides: Partial<PositionedDiagramNode> = {}): PositionedDiagramNode {
    // Cast: exactOptionalPropertyTypes rejects spreading a Partial whose optional members may be explicitly undefined.
    return { fanIn: 0, height: 72, id: 'one', label: 'One', width: 160, x: 0, y: 0, ...overrides } as PositionedDiagramNode
}

function renderNode(node: PositionedDiagramNode, diagramType: DiagramType = 'architecture', flowPreset?: DiagramFlowPreset) {
    const onSelect = vi.fn()
    render(
        <ThemeProvider theme={createAppTheme('dark')}>
            <DiagramNode diagramType={diagramType} flowPreset={flowPreset} node={node} onSelect={onSelect} />
        </ThemeProvider>,
    )

    return { button: screen.getByRole('button', { name: node.label }), onSelect }
}

function scrollWrapper(button: HTMLElement) {
    return button.querySelector('[data-diagram-scroll="content"]') as HTMLElement | null
}

describe('DiagramNode', () => {
    afterEach(cleanup)

    it('puts tag, label and sublabel in a scrollable wrapper that only anchors to the top when content overflows', () => {
        const { button } = renderNode(positioned({ sublabel: 'a very long sublabel that does not fit', tag: 'service' }))
        const wrapper = scrollWrapper(button)

        expect(wrapper).not.toBeNull()
        expect(getComputedStyle(wrapper as HTMLElement).overflowY).toBe('auto')
        expect(getComputedStyle(wrapper as HTMLElement).justifyContent).toBe('safe center')
        expect(getComputedStyle(wrapper as HTMLElement).minHeight).toBe('0px')
        expect(wrapper).toContainElement(screen.getByText('service'))
        expect(wrapper).toContainElement(screen.getByText('One'))
        expect(wrapper).toContainElement(screen.getByText('a very long sublabel that does not fit'))
    })

    it('wraps a single unbroken token in the label and sublabel instead of clipping it', () => {
        renderNode(positioned({ label: 'src/services/diagrams/diagram_layout.ts', sublabel: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }))

        expect(getComputedStyle(screen.getByText('src/services/diagrams/diagram_layout.ts')).overflowWrap).toBe('anywhere')
        expect(getComputedStyle(screen.getByText('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).overflowWrap).toBe('anywhere')
    })

    it('keeps the fanIn badge outside the scroll wrapper so it does not scroll away', () => {
        const { button } = renderNode(positioned({ fanIn: 3 }), 'dependency')

        expect(scrollWrapper(button)).not.toContainElement(screen.getByText('3 in'))
        expect(button).toContainElement(screen.getByText('3 in'))
    })

    it('keeps the entity divider and field list inside the same scroll wrapper as the header', () => {
        const node = positioned({ fields: [{ key: 'primary' as const, name: 'id', type: 'UUID' }], height: 120 })
        const { button } = renderNode(node, 'entity')
        const fields = screen.getByText('# id: UUID').parentElement as HTMLElement

        expect(scrollWrapper(button)).toContainElement(fields)
        expect(getComputedStyle(fields).borderTop).toContain('1px solid')
    })

    it('renders no text and no scroll wrapper for state preset start and end markers', () => {
        const { button } = renderNode(positioned({ height: 24, kind: 'start', label: 'Start', width: 24 }), 'flow', 'state')

        expect(scrollWrapper(button)).toBeNull()
        expect(button).toBeEmptyDOMElement()
    })

    it('honours an explicit height from the diagram JSON', () => {
        const { button } = renderNode(positioned({ height: 200 }))

        expect(getComputedStyle(button).height).toBe('200px')
    })

    it('selects the node on a plain click and on Enter', async () => {
        const { button, onSelect } = renderNode(positioned())
        const user = userEvent.setup()

        await user.click(button)
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'one', label: 'One' }))

        onSelect.mockClear()
        button.focus()
        await user.keyboard('{Enter}')
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'one', label: 'One' }))
    })

    it('does not select the node when the content scrolled between mousedown and click', () => {
        const { button, onSelect } = renderNode(positioned({ sublabel: 'long enough to scroll' }))
        const wrapper = scrollWrapper(button) as HTMLElement

        fireEvent.mouseDown(button)
        wrapper.scrollTop = 24
        fireEvent.click(button)

        expect(onSelect).not.toHaveBeenCalled()
    })
})

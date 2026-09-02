import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../data/action_types'
import type { DiagramMenuState, DiagramViewSnapshot, DiagramViewService } from '../../services/diagrams/diagram_view_service'
import { layout } from '../../services/diagrams/diagram_layout'
import { DiagramView } from './diagram_view'

vi.mock('../hooks/use_workspace_view', () => ({ useWorkspaceView: () => ({ selectedPath: null, viewMode: 'diagrams' }) }))

const actions = vi.hoisted(() => [
    { appliesTo: { kind: 'diagram', type: 'child' }, builtin: false, id: 'detail', label: 'Detail' },
    { appliesTo: { kind: 'diagram', type: 'root' }, builtin: false, id: 'overview', label: 'Overview' },
]) as ActionDefinition[]

vi.mock('../hooks/use_actions', () => ({ useActions: () => ({ actions }) }))
vi.mock('../actions/run/popup/action_popup', () => ({
    ActionPopup: ({ context, draggable, initialActionId }: {
        context: { kind: string, type?: string }, draggable?: boolean, initialActionId?: string,
    }) => {
        const matchingActions = actions.filter(({ appliesTo, builtin }) => (
            !builtin && appliesTo?.kind === context.kind && (appliesTo.type === undefined || appliesTo.type === context.type)
        ))
        if (matchingActions.length === 0) return null

        return (
            <div
                data-action-id={initialActionId}
                data-context={JSON.stringify(context)}
                data-draggable={String(!!draggable)}
                role="dialog"
            >
                {matchingActions.map(({ label }) => <span key={label}>{label}</span>)}
            </div>
        )
    },
}))

function initialSnapshot(): DiagramViewSnapshot {
    return {
        currentDiagram: layout({
            edges: [{ from: 'customer', id: 'customer-orders', kind: 'connection', label: 'places', to: 'orders' }],
            groups: [{ id: 'domain', label: 'Domain', nodeIds: ['customer', 'orders'] }],
            meta: {
                description: 'Customer ordering flow',
                legend: [{ label: 'Focus', role: 'focal' }],
                title: 'Orders',
                type: 'architecture',
                version: 1,
            },
            nodes: [
                { id: 'customer', label: 'Customer', role: 'focal' },
                { id: 'orders', label: 'Orders', role: 'backend' },
            ],
        }),
        currentDiagramError: null,
        error: null,
        index: {
            activePath: ['root-1', 'child-1'],
            children: {},
            diagrams: {
                'child-1': {
                    actionId: 'detail', id: 'child-1', label: 'Orders',
                    parent: { diagramId: 'root-1', itemId: 'orders', itemLabel: 'Orders' },
                    path: 'design/diagrams/child.json',
                },
                'root-1': { actionId: 'overview', id: 'root-1', label: 'Overview', path: 'design/diagrams/root.json' },
            },
            roots: { overview: ['root-1'] },
            version: 1,
        },
        menu: null,
        popup: null,
        status: 'ready',
    }
}

function createService() {
    let snapshot = initialSnapshot()
    const listeners = new Set<() => void>()
    const publish = (next: DiagramViewSnapshot) => {
        snapshot = next
        for (const listener of listeners) listener()
    }
    const service = {
        closeItemMenu: vi.fn(() => publish({ ...snapshot, menu: null })),
        closePopup: vi.fn(() => publish({ ...snapshot, popup: null })),
        getSavedChildren: vi.fn(() => [{ actionId: 'saved-action', id: 'saved-1', label: 'Saved Orders', path: 'design/diagrams/saved.json' }]),
        getSnapshot: () => snapshot,
        navigateBack: vi.fn(async () => undefined),
        navigateToCrumb: vi.fn(async () => undefined),
        navigateToSavedDiagram: vi.fn(async () => undefined),
        open: vi.fn(async () => undefined),
        openChildPopup: vi.fn((actionId: string) => {
            const menu = snapshot.menu
            if (!menu) return
            publish({
                ...snapshot,
                menu: null,
                popup: {
                    anchorElement: menu.anchorElement as HTMLElement,
                    context: {
                        diagramId: menu.diagramId,
                        diagramItemId: menu.itemId,
                        kind: 'diagram',
                        parentNode: menu.itemLabel,
                        type: 'child',
                    },
                    initialActionId: actionId,
                },
            })
        }),
        openItemMenu: vi.fn((menu: DiagramMenuState) => publish({ ...snapshot, menu })),
        openRootPopup: vi.fn((anchorElement: HTMLElement) => publish({
            ...snapshot,
            popup: snapshot.popup?.context.type === 'root'
                ? null
                : { anchorElement, context: { kind: 'diagram', type: 'root' } },
        })),
        subscribe: (listener: () => void) => {
            listeners.add(listener)

            return () => listeners.delete(listener)
        },
    }

    return service as unknown as DiagramViewService & {
        navigateBack: ReturnType<typeof vi.fn>
        navigateToCrumb: ReturnType<typeof vi.fn>
        navigateToSavedDiagram: ReturnType<typeof vi.fn>
        closePopup: ReturnType<typeof vi.fn>
        openItemMenu: ReturnType<typeof vi.fn>
        openRootPopup: ReturnType<typeof vi.fn>
    }
}

describe('DiagramView', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        actions.splice(0, actions.length,
            { appliesTo: { kind: 'diagram', type: 'child' }, builtin: false, id: 'detail', label: 'Detail' },
            { appliesTo: { kind: 'diagram', type: 'root' }, builtin: false, id: 'overview', label: 'Overview' },
        )
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    })
    afterEach(cleanup)

    it('opens item menu by pointer and offers matching child actions plus saved diagrams', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)

        await user.click(screen.getByRole('button', { name: 'Customer' }))

        expect(service.openItemMenu).toHaveBeenCalledWith(expect.objectContaining({diagramId: 'child-1', itemId: 'customer', itemLabel: 'Customer'}))
        expect(screen.getByRole('menuitem', { name: 'Detail' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Saved Orders' })).toBeInTheDocument()
    })

    it('supports keyboard activation and opens preselected child action with parent label', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)

        const item = screen.getByRole('button', { name: 'Customer' })
        item.focus()
        await user.keyboard('{Enter}')
        await user.click(screen.getByRole('menuitem', { name: 'Detail' }))

        const popup = screen.getByRole('dialog')
        expect(popup).toHaveAttribute('data-action-id', 'detail')
        expect(popup.getAttribute('data-context')).toContain('"parentNode":"Customer"')
    })

    it('opens item menu from a selectable edge with its accessible label', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)

        await user.click(screen.getByRole('button', { name: 'places' }))

        expect(service.openItemMenu).toHaveBeenCalledWith(expect.objectContaining({diagramId: 'child-1', itemId: 'customer-orders', itemLabel: 'places'}))
    })

    it('navigates Back, breadcrumbs, and saved diagrams without opening action popup', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)

        await user.click(screen.getByRole('button', { name: 'Back' }))
        await user.click(screen.getByRole('button', { name: 'Overview' }))
        await user.click(screen.getByRole('button', { name: 'Customer' }))
        await user.click(screen.getByRole('menuitem', { name: 'Saved Orders' }))

        expect(service.navigateBack).toHaveBeenCalledTimes(1)
        expect(service.navigateToCrumb).toHaveBeenCalledWith(0)
        expect(service.navigateToSavedDiagram).toHaveBeenCalledWith('saved-1')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens only matching root actions, passes draggable, then closes on second plain click', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)

        const button = screen.getByRole('button', { name: 'Diagram action' })
        await user.click(button)

        const popup = screen.getByRole('dialog')
        expect(popup).toHaveTextContent('Overview')
        expect(popup).not.toHaveTextContent('Detail')
        expect(popup).toHaveAttribute('data-context', '{"kind":"diagram","type":"root"}')
        expect(popup).toHaveAttribute('data-draggable', 'true')

        await user.click(button)

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(service.openRootPopup).toHaveBeenCalledTimes(2)
    })

    it('moves launcher without opening popup, then opens it on following plain click', async () => {
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)
        const button = screen.getByRole('button', { name: 'Diagram action' })

        fireEvent.pointerDown(button, { clientX: 1140, clientY: 740, pointerId: 1 })
        fireEvent.pointerMove(button, { clientX: 900, clientY: 500, pointerId: 1 })
        fireEvent.pointerUp(button, { pointerId: 1 })
        fireEvent.click(button)

        expect(screen.getByTestId('movable-fab-position')).toHaveStyle({ left: '888px', top: '488px' })
        expect(service.closePopup).toHaveBeenCalledTimes(1)
        expect(service.openRootPopup).not.toHaveBeenCalled()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

        await user.click(button)
        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('keeps launcher disabled with explanation when no root actions exist', async () => {
        actions.splice(1, 1, { appliesTo: { kind: 'project' }, builtin: false, id: 'generic', label: 'Generic' })
        const service = createService()
        const user = userEvent.setup()
        render(<DiagramView service={service} />)
        const button = screen.getByRole('button', { name: 'Diagram action' })

        expect(button).toBeDisabled()
        await user.hover(screen.getByTestId('movable-fab-position'))

        expect(await screen.findByText('No root diagram actions configured')).toBeInTheDocument()
        expect(service.openRootPopup).not.toHaveBeenCalled()
    })
})

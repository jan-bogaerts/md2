import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramData } from '../../services/diagrams/diagram_data';
import type { DiagramEdgeDrawingDefaults } from '../../services/diagrams/diagram_edge_drawing_service';
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service';
import type { DiagramNodePlacementDefinition } from '../../services/diagrams/diagram_node_placement_service';
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service';
import { DiagramAddControl } from './diagram_add_control';

const architectureDiagram: DiagramData = {
    edges: [],
    groups: [],
    meta: { description: 'Architecture', title: 'System', type: 'architecture', version: 1 },
    nodes: [],
};
const sequenceDiagram: DiagramData = {
    edges: [],
    fragments: [],
    groups: [],
    meta: { description: 'Sequence', title: 'Call', type: 'sequence', version: 1 },
    nodes: [],
};

class SourceStub extends EventTarget {
    private readonly diagram: DiagramData;

    constructor(diagram: DiagramData) {
        super();
        this.diagram = diagram;
    }

    getSourceSnapshot = (): DiagramViewSourceSnapshot => ({
        diagram: this.diagram,
        record: { actionId: 'action', id: 'diagram', label: 'Diagram', path: 'diagram.json' },
    });

    subscribeSource = (listener: () => void) => {
        this.addEventListener('source', listener);

        return () => this.removeEventListener('source', listener);
    };
}

function createSession(diagram: DiagramData) {
    const session = new DiagramEditSessionService(new SourceStub(diagram));
    session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/project' });
    session.start();

    return session;
}

afterEach(cleanup);

describe('DiagramAddControl', () => {
    it('filters tools, reuses legend samples, and reactivates selected tool', async () => {
        const session = createSession(architectureDiagram);
        const placement = {
            activate: vi.fn((definition: DiagramNodePlacementDefinition) => {
                session.setActiveTool(`node:${definition.kind}`);

                return true;
            }),
        };
        const drawing = {
            activate: vi.fn(({ kind }: DiagramEdgeDrawingDefaults) => {
                session.setActiveTool(`edge:${kind}`);

                return true;
            }),
        };
        const user = userEvent.setup();
        render(
            <DiagramAddControl
                drawing={drawing}
                fragmentDialog={{ openCreate: vi.fn() }}
                groupDrawing={{ activate: vi.fn(() => true) }}
                placement={placement}
                session={session}
            />,
        );

        expect(screen.getByRole('button', { name: 'Add tool' })).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Choose Add tool' }));
        const menu = screen.getByRole('menu', { name: 'Add diagram tool' });
        expect(within(menu).getByRole('menuitem', { name: 'Component' })).toBeInTheDocument();
        expect(within(menu).queryByRole('menuitem', { name: 'Participant' })).not.toBeInTheDocument();
        expect(within(menu).queryByRole('menuitem', { name: 'Fragment' })).not.toBeInTheDocument();
        expect(document.querySelector('[data-role="focal"]')).toBeInTheDocument();
        expect(document.querySelector('svg[data-kind="connection"]')).toBeInTheDocument();

        await user.click(within(menu).getByRole('menuitem', { name: 'Component' }));
        expect(session.getLastSelectedCreationToolSnapshot()).toBe('node:component');
        expect(screen.getByRole('button', { name: 'Add Component' })).toBeEnabled();

        await user.click(screen.getByRole('button', { name: 'Add Component' }));
        expect(placement.activate).toHaveBeenCalledTimes(2);
    });

    it('offers and activates sequence fragment with renderer-matching sample', async () => {
        const session = createSession(sequenceDiagram);
        const openCreate = vi.fn();
        const user = userEvent.setup();
        render(
            <DiagramAddControl
                drawing={{ activate: vi.fn(() => true) }}
                fragmentDialog={{ openCreate }}
                groupDrawing={{ activate: vi.fn(() => true) }}
                placement={{ activate: vi.fn(() => true) }}
                session={session}
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Choose Add tool' }));
        const menu = screen.getByRole('menu', { name: 'Add diagram tool' });
        expect(within(menu).queryByRole('menuitem', { name: 'Component' })).not.toBeInTheDocument();
        const fragment = within(menu).getByRole('menuitem', { name: 'Fragment' });
        expect(within(fragment).getByText('opt')).toBeInTheDocument();

        await user.click(fragment);

        expect(openCreate).toHaveBeenCalledOnce();
        expect(session.getLastSelectedCreationToolSnapshot()).toBe('fragment');
    });

    it('closes popper with Escape and returns focus to dropdown', async () => {
        const session = createSession(architectureDiagram);
        const user = userEvent.setup();
        render(<DiagramAddControl session={session} />);
        const dropdown = screen.getByRole('button', { name: 'Choose Add tool' });

        await user.click(dropdown);
        await user.keyboard('{Escape}');

        expect(screen.queryByRole('menu', { name: 'Add diagram tool' })).not.toBeInTheDocument();
        expect(dropdown).toHaveFocus();
        expect(dropdown).toHaveAttribute('aria-expanded', 'false');
    });
});

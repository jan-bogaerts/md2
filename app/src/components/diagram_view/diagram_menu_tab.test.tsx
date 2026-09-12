import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { DiagramData } from '../../services/diagrams/diagram_data';
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service';
import type { DiagramViewService, DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service';
import { DiagramMenuTab } from './diagram_menu_tab';

const diagram: DiagramData = {
    edges: [],
    groups: [],
    meta: { description: 'Architecture', title: 'System', type: 'architecture', version: 1 },
    nodes: [],
};

class SourceStub extends EventTarget {
    private source: DiagramViewSourceSnapshot | null;

    constructor(source: DiagramViewSourceSnapshot | null) {
        super();
        this.source = source;
    }

    getSourceSnapshot = () => this.source;

    subscribeSource = (listener: () => void) => {
        this.addEventListener('source', listener);

        return () => this.removeEventListener('source', listener);
    };
}

function sourceSnapshot(): DiagramViewSourceSnapshot {
    return {
        diagram,
        record: { actionId: 'action', id: 'diagram', label: 'Diagram', path: 'diagram.json' },
    };
}

function createSession(source: SourceStub) {
    const session = new DiagramEditSessionService(source);
    session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/project' });

    return session;
}

afterEach(cleanup);

describe('DiagramMenuTab', () => {
    it('shows Edit only with a current diagram, then shows editing controls', async () => {
        const source = new SourceStub(sourceSnapshot());
        const session = createSession(source);
        const user = userEvent.setup();
        render(<DiagramMenuTab session={session} viewService={source as unknown as DiagramViewService} />);

        expect(screen.getByRole('button', { name: 'Edit diagram' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Edit diagram' }));

        expect(screen.queryByRole('button', { name: 'Edit diagram' })).not.toBeInTheDocument();
        for (const name of ['Select', 'Pan', 'Cut', 'Copy', 'Paste', 'Delete', 'Review', 'Metadata', 'Legend']) {
            expect(screen.getByRole('button', { name })).toBeInTheDocument();
        }
        expect(screen.getByRole('button', { name: 'Choose Add tool' })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('group', { name: 'Diagram comparison layout' })).toBeInTheDocument();
    });

    it('shows no Edit action without a current diagram', () => {
        const source = new SourceStub(null);
        const session = createSession(source);
        render(<DiagramMenuTab session={session} viewService={source as unknown as DiagramViewService} />);

        expect(screen.queryByRole('button', { name: 'Edit diagram' })).not.toBeInTheDocument();
    });
});

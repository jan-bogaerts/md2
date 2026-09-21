import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { DiagramData, DiagramEdgeKind, DiagramRole } from '../../services/diagrams/diagram_data';
import type { DiagramScaleField } from '../../services/diagrams/diagram_formatting';
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service';
import type { DiagramViewService, DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service';
import { DiagramMenuTab } from './diagram_menu_tab';

const diagram: DiagramData = {
    edges: [],
    groups: [],
    meta: { description: 'Architecture', title: 'System', type: 'architecture', version: 1 },
    nodes: [{ id: 'node', label: 'Node', role: 'focal' }],
};

class SourceStub extends EventTarget {
    private source: DiagramViewSourceSnapshot | null;

    constructor(source: DiagramViewSourceSnapshot | null) {
        super();
        this.source = source;
    }

    getSourceSnapshot = () => this.source;

    getFormattingScaleSnapshot = (field: DiagramScaleField) => this.source?.diagram.formatting?.[field] ?? 100;

    getNodeRoleFormattingSnapshot = (role: DiagramRole) => this.source?.diagram.formatting?.nodeRoles?.[role];

    getConnectionKindFormattingSnapshot = (kind: DiagramEdgeKind) => this.source?.diagram.formatting?.connectionKinds?.[kind];

    setFormattingScale = (field: DiagramScaleField, value: number) => {
        if (!this.source) return;

        this.source.diagram.formatting = { ...this.source.diagram.formatting, [field]: value };
        this.dispatchEvent(new Event(`formatting:${field}`));
    };

    subscribeFormattingScale = (field: DiagramScaleField, listener: () => void) => {
        this.addEventListener(`formatting:${field}`, listener);

        return () => this.removeEventListener(`formatting:${field}`, listener);
    };

    subscribeNodeRoleFormatting = (role: DiagramRole, listener: () => void) => {
        this.addEventListener(`formatting:role:${role}`, listener);

        return () => this.removeEventListener(`formatting:role:${role}`, listener);
    };

    subscribeConnectionKindFormatting = (kind: DiagramEdgeKind, listener: () => void) => {
        this.addEventListener(`formatting:kind:${kind}`, listener);

        return () => this.removeEventListener(`formatting:kind:${kind}`, listener);
    };

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
        for (const label of ['font size', 'box size', 'spacing']) {
            expect(screen.getByRole('button', { name: `Adjust Current ${label}` })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: `Adjust New ${label}` })).not.toBeInTheDocument();
        }

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

    it('shows six distinct formatting icon buttons without toolbar values in edit mode', async () => {
        const source = new SourceStub(sourceSnapshot());
        const session = createSession(source);
        const user = userEvent.setup();
        session.start();
        render(<DiagramMenuTab session={session} viewService={source as unknown as DiagramViewService} />);

        const labels = [
            'Adjust New font size',
            'Adjust New box size',
            'Adjust New spacing',
            'Adjust Current font size',
            'Adjust Current box size',
            'Adjust Current spacing',
        ];
        for (const label of labels) {
            const button = screen.getByRole('button', { name: label });
            await user.hover(button);
            expect(await screen.findByRole('tooltip', { name: label })).toBeInTheDocument();
            await user.unhover(button);
            await waitFor(() => expect(screen.queryByRole('tooltip', { name: label })).not.toBeInTheDocument());
        }

        expect(screen.getAllByTestId('FormatSizeOutlinedIcon')).toHaveLength(2);
        expect(screen.getAllByTestId('AspectRatioOutlinedIcon')).toHaveLength(2);
        expect(screen.getAllByTestId('FormatLineSpacingOutlinedIcon')).toHaveLength(2);
        expect(screen.queryByText('100%')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Decrease|Increase/u })).not.toBeInTheDocument();

    });
});

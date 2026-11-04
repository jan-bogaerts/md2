import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { DiagramData } from '../../../services/diagrams/diagram_data';
import { DiagramFormatPasteService } from '../../../services/diagrams/diagram_format_paste_service';
import type { DiagramSelectionIdentity } from '../../../services/diagrams/diagram_selection_service';
import { DiagramFormatPasteButton } from './diagram_format_paste_button';

const diagram: DiagramData = {
    edges: [{ from: 'source', id: 'edge', kind: 'connection', legendEntryId: 'connection', to: 'target' }],
    groups: [],
    meta: {
        description: 'Button test',
        legend: [
            { id: 'focal', label: 'Focal', role: 'focal' },
            { id: 'backend', label: 'Backend', role: 'backend' },
            { id: 'connection', kind: 'connection', label: 'Connection', useLabelAsDefault: false },
        ],
        title: 'Button test',
        type: 'architecture',
        version: 3,
    },
    nodes: [
        { id: 'source', label: 'Source', legendEntryId: 'focal', role: 'focal' },
        { id: 'target', label: 'Target', legendEntryId: 'backend', role: 'backend' },
    ],
};

class SelectionStub extends EventTarget {
    private selection: readonly DiagramSelectionIdentity[] = Object.freeze([]);

    getSelectionSnapshot = () => this.selection;

    subscribeSelection = (listener: () => void) => {
        this.addEventListener('selection', listener);

        return () => this.removeEventListener('selection', listener);
    };

    select(...selection: DiagramSelectionIdentity[]) {
        this.selection = Object.freeze(selection);
        this.dispatchEvent(new Event('selection'));
    }
}

class SessionStub extends EventTarget {
    private session: object | null = { sourceDiagramId: 'diagram' };

    readonly read = {
        getSessionSnapshot: () => this.session,
        subscribeSession: (listener: () => void) => {
            this.addEventListener('session', listener);

            return () => this.removeEventListener('session', listener);
        },
    };

    end() {
        this.session = null;
        this.dispatchEvent(new Event('session'));
    }
}

function reader() {
    return {
        read: {
            getEdgeSnapshot: (id: string) => diagram.edges.find((edge) => edge.id === id) ?? null,
            getEditableDiagram: () => diagram,
            getNodeSnapshot: (id: string) => diagram.nodes.find((node) => node.id === id) ?? null,
        },
    };
}

afterEach(cleanup);

describe('DiagramFormatPasteButton', () => {
    it('enables only for an active session, source, and matching selected target', async () => {
        const formatPaste = new DiagramFormatPasteService();
        const selection = new SelectionStub();
        const session = new SessionStub();
        const user = userEvent.setup();
        render(
            <DiagramFormatPasteButton
                formatPaste={formatPaste}
                selection={selection}
                session={session as never}
            />,
        );
        const button = screen.getByRole('button', { name: 'Format Paste' });

        expect(button).toBeDisabled();
        act(() => {
            formatPaste.captureSuccessfulCopy([{ objectId: 'source', objectKind: 'node' }], reader());
            selection.select({ objectId: 'edge', objectKind: 'edge' });
        });
        expect(button).toBeDisabled();
        act(() => { selection.select({ objectId: 'target', objectKind: 'node' }); });
        expect(button).toBeEnabled();
        await user.click(button);
        expect(formatPaste.getDialogOpenSnapshot()).toBe(true);

        act(() => { session.end(); });
        expect(button).toBeDisabled();
    });
});

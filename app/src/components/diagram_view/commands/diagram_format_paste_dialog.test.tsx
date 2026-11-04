import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramData } from '../../../services/diagrams/diagram_data';
import { DiagramFormatPasteService } from '../../../services/diagrams/diagram_format_paste_service';
import type { DiagramSelectionIdentity } from '../../../services/diagrams/diagram_selection_service';
import { DiagramFormatPasteDialog } from './diagram_format_paste_dialog';

const diagram: DiagramData = {
    edges: [],
    groups: [],
    meta: {
        description: 'Dialog test',
        legend: [
            { id: 'focal', label: 'Focal', role: 'focal' },
            { id: 'backend', label: 'Backend', role: 'backend' },
        ],
        title: 'Dialog test',
        type: 'architecture',
        version: 3,
    },
    nodes: [
        { id: 'source', kind: 'component', label: 'Source', legendEntryId: 'focal', role: 'focal' },
        { id: 'target', kind: 'component', label: 'Target', legendEntryId: 'backend', role: 'backend' },
    ],
};

class SelectionStub extends EventTarget {
    private selection: readonly DiagramSelectionIdentity[] = Object.freeze([
        { objectId: 'target', objectKind: 'node' },
    ]);

    getSelectionSnapshot = () => this.selection;

    subscribeSelection = (listener: () => void) => {
        this.addEventListener('selection', listener);

        return () => this.removeEventListener('selection', listener);
    };
}

class SessionStub extends EventTarget {
    private session: object | null = { sourceDiagramId: 'diagram' };

    readonly formatPaste = { apply: vi.fn(() => true) };

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
            getEdgeSnapshot: () => null,
            getEditableDiagram: () => diagram,
            getNodeSnapshot: (id: string) => diagram.nodes.find((node) => node.id === id) ?? null,
        },
    };
}

afterEach(cleanup);

describe('DiagramFormatPasteDialog', () => {
    it('supports checkbox combinations and keyboard Apply', async () => {
        const formatPaste = new DiagramFormatPasteService();
        const selection = new SelectionStub();
        const session = new SessionStub();
        formatPaste.captureSuccessfulCopy([{ objectId: 'source', objectKind: 'node' }], reader());
        formatPaste.openDialog();
        const user = userEvent.setup();
        render(
            <DiagramFormatPasteDialog
                formatPaste={formatPaste}
                selection={selection}
                session={session as never}
            />,
        );

        expect(screen.getByRole('checkbox', { name: 'Legend' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Kind' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Label' })).toBeChecked();
        await user.click(screen.getByRole('checkbox', { name: 'Legend' }));
        await user.click(screen.getByRole('checkbox', { name: 'Kind' }));
        await user.click(screen.getByRole('checkbox', { name: 'Label' }));
        expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
        await user.click(screen.getByRole('checkbox', { name: 'Label' }));
        screen.getByRole('button', { name: 'Apply' }).focus();
        await user.keyboard('{Enter}');

        expect(session.formatPaste.apply).toHaveBeenCalledWith(
            expect.objectContaining({ label: 'Source', objectKind: 'node' }),
            [{ objectId: 'target', objectKind: 'node' }],
            { kind: false, label: true, legend: false },
        );
        expect(formatPaste.getDialogOpenSnapshot()).toBe(false);
    });

    it('cancels with Escape and closes on session end without clearing source', async () => {
        const formatPaste = new DiagramFormatPasteService();
        const session = new SessionStub();
        formatPaste.captureSuccessfulCopy([{ objectId: 'source', objectKind: 'node' }], reader());
        formatPaste.openDialog();
        const user = userEvent.setup();
        render(<DiagramFormatPasteDialog formatPaste={formatPaste} session={session as never} />);

        await user.keyboard('{Escape}');
        expect(formatPaste.getDialogOpenSnapshot()).toBe(false);
        expect(session.formatPaste.apply).not.toHaveBeenCalled();

        act(() => { formatPaste.openDialog(); });
        expect(screen.getByRole('dialog', { name: 'Format Paste' })).toBeInTheDocument();
        act(() => { session.end(); });
        expect(formatPaste.getDialogOpenSnapshot()).toBe(false);
        expect(formatPaste.getSourceSnapshot()).not.toBeNull();
    });
});

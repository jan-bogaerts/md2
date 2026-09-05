import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramType } from '../../services/diagrams/diagram_data';
import type { DiagramPersistentTool } from '../../services/diagrams/diagram_edit_session_service';
import {
    DiagramComponentNodeButton,
    type DiagramComponentNodePlacement,
} from './diagram_component_node_button';

class ComponentNodeSessionStub extends EventTarget {
    private activeTool: DiagramPersistentTool = 'select';
    private readonly diagramType: DiagramType;

    constructor(diagramType: DiagramType) {
        super();
        this.diagramType = diagramType;
    }

    readonly getActiveToolSnapshot = () => this.activeTool;
    readonly getMetadataFieldSnapshot = () => this.diagramType;
    readonly subscribeActiveTool = (listener: () => void) => {
        this.addEventListener('activeToolChanged', listener);

        return () => this.removeEventListener('activeToolChanged', listener);
    };
    readonly subscribeMetadataField = vi.fn((_field: 'type', listener: () => void) => {
        this.addEventListener('typeChanged', listener);

        return () => this.removeEventListener('typeChanged', listener);
    });
    readonly subscribeSession = (listener: () => void) => {
        this.addEventListener('sessionChanged', listener);

        return () => this.removeEventListener('sessionChanged', listener);
    };

    setActiveTool(activeTool: DiagramPersistentTool) {
        this.activeTool = activeTool;
        this.dispatchEvent(new Event('activeToolChanged'));
    }
}

afterEach(cleanup);

describe('DiagramComponentNodeButton', () => {
    it.each(['architecture', 'dependency'] as const)(
        'activates component defaults for %s diagrams and observes only diagram type availability',
        (diagramType) => {
            const session = new ComponentNodeSessionStub(diagramType);
            const placement: DiagramComponentNodePlacement = { activate: vi.fn(() => true) };
            render(<DiagramComponentNodeButton placement={placement} session={session} />);
            const button = screen.getByRole('button', { name: 'Component' });

            expect(button).toHaveAttribute('aria-pressed', 'false');
            fireEvent.click(button);

            expect(placement.activate).toHaveBeenCalledWith({
                defaults: { height: 72, label: 'New component', role: 'focal', width: 160 },
                kind: 'component',
            });
            expect(session.subscribeMetadataField.mock.calls.every(([field]) => field === 'type')).toBe(true);

            act(() => { session.setActiveTool('node:component'); });
            expect(button).toHaveAttribute('aria-pressed', 'true');
        },
    );

    it.each(['sequence', 'flow', 'entity'] as const)('is absent for %s diagrams', (diagramType) => {
        render(
            <DiagramComponentNodeButton
                placement={{ activate: vi.fn(() => true) }}
                session={new ComponentNodeSessionStub(diagramType)}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Component' })).not.toBeInTheDocument();
    });
});

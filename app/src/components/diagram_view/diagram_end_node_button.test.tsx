import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramFlowPreset, DiagramType } from '../../services/diagrams/diagram_data';
import type { DiagramPersistentTool } from '../../services/diagrams/diagram_edit_session_service';
import {
    DiagramEndNodeButton,
    type DiagramEndNodeMetadataField,
    type DiagramEndNodePlacement,
    type DiagramEndNodeSession,
} from './diagram_end_node_button';

class EndNodeSessionStub extends EventTarget {
    private activeTool: DiagramPersistentTool = 'select';
    private readonly diagramType: DiagramType;
    private readonly flowPreset: DiagramFlowPreset | null;

    constructor(diagramType: DiagramType, flowPreset: DiagramFlowPreset | null = null) {
        super();
        this.diagramType = diagramType;
        this.flowPreset = flowPreset;
    }

    readonly getActiveToolSnapshot = () => this.activeTool;
    readonly getMetadataFieldSnapshot = ((field: DiagramEndNodeMetadataField) => (
        field === 'preset' ? this.flowPreset : this.diagramType
    )) as DiagramEndNodeSession['getMetadataFieldSnapshot'];
    readonly subscribeActiveTool = (listener: () => void) => {
        this.addEventListener('activeToolChanged', listener);

        return () => this.removeEventListener('activeToolChanged', listener);
    };
    readonly subscribeMetadataField = vi.fn((field: DiagramEndNodeMetadataField, listener: () => void) => {
        this.addEventListener(`${field}Changed`, listener);

        return () => this.removeEventListener(`${field}Changed`, listener);
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

describe('DiagramEndNodeButton', () => {
    it('activates flowchart end defaults and observes only type and preset availability', () => {
        const session = new EndNodeSessionStub('flow', 'flowchart');
        const placement: DiagramEndNodePlacement = { activate: vi.fn(() => true) };
        render(<DiagramEndNodeButton placement={placement} session={session} />);
        const button = screen.getByRole('button', { name: 'End' });

        expect(button).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(button);

        expect(placement.activate).toHaveBeenCalledWith({
            defaults: { height: 48, label: 'End', role: 'focal', width: 120 },
            kind: 'end',
        });
        expect(session.subscribeMetadataField.mock.calls.every(
            ([field]) => field === 'preset' || field === 'type',
        )).toBe(true);

        act(() => { session.setActiveTool('node:end'); });
        expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it('activates the smaller state end-marker geometry for the state preset', () => {
        const placement: DiagramEndNodePlacement = { activate: vi.fn(() => true) };
        render(
            <DiagramEndNodeButton placement={placement} session={new EndNodeSessionStub('flow', 'state')} />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'End' }));

        expect(placement.activate).toHaveBeenCalledWith({
            defaults: { height: 24, label: 'End', role: 'focal', width: 24 },
            kind: 'end',
        });
    });

    it.each(['architecture', 'dependency', 'sequence', 'entity'] as const)(
        'is absent for %s diagrams',
        (diagramType) => {
            render(
                <DiagramEndNodeButton
                    placement={{ activate: vi.fn(() => true) }}
                    session={new EndNodeSessionStub(diagramType)}
                />,
            );

            expect(screen.queryByRole('button', { name: 'End' })).not.toBeInTheDocument();
        },
    );
});

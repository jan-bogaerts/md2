import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramFlowPreset, DiagramType } from '../../services/diagrams/diagram_data';
import type { DiagramPersistentTool } from '../../services/diagrams/diagram_edit_session_service';
import {
    DiagramStepNodeButton,
    type DiagramStepNodeMetadataField,
    type DiagramStepNodePlacement,
} from './diagram_step_node_button';

class StepNodeSessionStub extends EventTarget {
    private activeTool: DiagramPersistentTool = 'select';
    private readonly diagramType: DiagramType;
    private readonly flowPreset: DiagramFlowPreset | null;

    constructor(diagramType: DiagramType, flowPreset: DiagramFlowPreset | null = null) {
        super();
        this.diagramType = diagramType;
        this.flowPreset = flowPreset;
    }

    readonly getActiveToolSnapshot = () => this.activeTool;
    readonly getMetadataFieldSnapshot = (field: DiagramStepNodeMetadataField) => (
        field === 'preset' ? this.flowPreset : this.diagramType
    );
    readonly subscribeActiveTool = (listener: () => void) => {
        this.addEventListener('activeToolChanged', listener);

        return () => this.removeEventListener('activeToolChanged', listener);
    };
    readonly subscribeMetadataField = vi.fn((field: DiagramStepNodeMetadataField, listener: () => void) => {
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

describe('DiagramStepNodeButton', () => {
    it('activates step defaults for flowchart diagrams and observes only type and preset availability', () => {
        const session = new StepNodeSessionStub('flow', 'flowchart');
        const placement: DiagramStepNodePlacement = { activate: vi.fn(() => true) };
        render(<DiagramStepNodeButton placement={placement} session={session} />);
        const button = screen.getByRole('button', { name: 'Step' });

        expect(button).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(button);

        expect(placement.activate).toHaveBeenCalledWith({
            defaults: { height: 72, label: 'New step', role: 'focal', width: 160 },
            kind: 'step',
        });
        expect(session.subscribeMetadataField.mock.calls.every(
            ([field]) => field === 'preset' || field === 'type',
        )).toBe(true);

        act(() => { session.setActiveTool('node:step'); });
        expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it('is absent for flow diagrams using the state preset', () => {
        render(
            <DiagramStepNodeButton
                placement={{ activate: vi.fn(() => true) }}
                session={new StepNodeSessionStub('flow', 'state')}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Step' })).not.toBeInTheDocument();
    });

    it.each(['architecture', 'dependency', 'sequence', 'entity'] as const)(
        'is absent for %s diagrams',
        (diagramType) => {
            render(
                <DiagramStepNodeButton
                    placement={{ activate: vi.fn(() => true) }}
                    session={new StepNodeSessionStub(diagramType)}
                />,
            );

            expect(screen.queryByRole('button', { name: 'Step' })).not.toBeInTheDocument();
        },
    );
});

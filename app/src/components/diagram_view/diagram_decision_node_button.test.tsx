import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramFlowPreset, DiagramType } from '../../services/diagrams/diagram_data';
import type { DiagramPersistentTool } from '../../services/diagrams/diagram_edit_session_service';
import {
    DiagramDecisionNodeButton,
    type DiagramDecisionNodePlacement,
} from './diagram_decision_node_button';

class DecisionNodeSessionStub extends EventTarget {
    private activeTool: DiagramPersistentTool = 'select';
    private readonly diagramType: DiagramType;
    private readonly preset: DiagramFlowPreset | null;

    constructor(diagramType: DiagramType, preset: DiagramFlowPreset | null = null) {
        super();
        this.diagramType = diagramType;
        this.preset = preset;
    }

    readonly getActiveToolSnapshot = () => this.activeTool;
    readonly getMetadataFieldSnapshot = (field: 'preset' | 'type') => (
        field === 'type' ? this.diagramType : this.preset
    );
    readonly subscribeActiveTool = (listener: () => void) => {
        this.addEventListener('activeToolChanged', listener);

        return () => this.removeEventListener('activeToolChanged', listener);
    };
    readonly subscribeMetadataField = vi.fn((field: 'preset' | 'type', listener: () => void) => {
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

describe('DiagramDecisionNodeButton', () => {
    it('activates decision defaults for flowchart preset and observes only type and preset availability', () => {
        const session = new DecisionNodeSessionStub('flow', 'flowchart');
        const placement: DiagramDecisionNodePlacement = { activate: vi.fn(() => true) };
        render(<DiagramDecisionNodeButton placement={placement} session={session} />);
        const button = screen.getByRole('button', { name: 'Decision' });

        expect(button).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(button);

        expect(placement.activate).toHaveBeenCalledWith({
            defaults: { height: 96, label: 'New decision', role: 'focal', width: 96 },
            kind: 'decision',
        });
        expect(session.subscribeMetadataField.mock.calls.map(([field]) => field)).toEqual(['type', 'preset']);

        act(() => { session.setActiveTool('node:decision'); });
        expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it.each([
        ['flow', 'state'],
        ['architecture', null],
        ['dependency', null],
        ['sequence', null],
        ['entity', null],
    ] as const)('is absent for %s/%s diagrams', (diagramType, preset) => {
        render(
            <DiagramDecisionNodeButton
                placement={{ activate: vi.fn(() => true) }}
                session={new DecisionNodeSessionStub(diagramType, preset)}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Decision' })).not.toBeInTheDocument();
    });
});

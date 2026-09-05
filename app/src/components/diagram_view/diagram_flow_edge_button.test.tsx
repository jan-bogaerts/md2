import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramFlowPreset, DiagramType } from '../../services/diagrams/diagram_data';
import type { DiagramPersistentTool } from '../../services/diagrams/diagram_edit_session_service';
import {
    DiagramFlowEdgeButton,
    type DiagramFlowEdgeDrawing,
} from './diagram_flow_edge_button';

class FlowEdgeSessionStub extends EventTarget {
    private activeTool: DiagramPersistentTool = 'select';
    private readonly diagramType: DiagramType;
    private flowPreset: DiagramFlowPreset | null;

    constructor(diagramType: DiagramType, flowPreset: DiagramFlowPreset | null = null) {
        super();
        this.diagramType = diagramType;
        this.flowPreset = flowPreset;
    }

    readonly getActiveToolSnapshot = () => this.activeTool;
    readonly getMetadataFieldSnapshot = (field: 'preset' | 'type') => (
        field === 'preset' ? this.flowPreset : this.diagramType
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

    setFlowPreset(flowPreset: DiagramFlowPreset | null) {
        this.flowPreset = flowPreset;
        this.dispatchEvent(new Event('presetChanged'));
    }
}

afterEach(cleanup);

describe('DiagramFlowEdgeButton', () => {
    it.each([
        ['Flow', 'flow', 'flowchart'],
        ['Transition', 'transition', 'state'],
    ] as const)('activates %s through shared drawing', (label, kind, preset) => {
        const session = new FlowEdgeSessionStub('flow', preset);
        const drawing: DiagramFlowEdgeDrawing = { activate: vi.fn(() => true) };
        render(<DiagramFlowEdgeButton drawing={drawing} kind={kind} label={label} preset={preset} session={session} />);
        const button = screen.getByRole('button', { name: label });

        fireEvent.click(button);

        expect(drawing.activate).toHaveBeenCalledWith({ kind });
        expect(session.subscribeMetadataField).toHaveBeenCalledWith('preset', expect.any(Function));
        expect(session.subscribeMetadataField).toHaveBeenCalledWith('type', expect.any(Function));
        act(() => { session.setActiveTool(`edge:${kind}`); });
        expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it.each([
        ['Flow', 'flow', 'flowchart', 'state'],
        ['Transition', 'transition', 'state', 'flowchart'],
    ] as const)('hides %s while the diagram uses the other flow preset', (label, kind, preset, otherPreset) => {
        render(
            <DiagramFlowEdgeButton
                drawing={{ activate: vi.fn(() => true) }}
                kind={kind}
                label={label}
                preset={preset}
                session={new FlowEdgeSessionStub('flow', otherPreset)}
            />,
        );

        expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    });

    it.each(['architecture', 'dependency', 'sequence', 'entity'] as const)('is absent for %s diagrams', (diagramType) => {
        render(
            <DiagramFlowEdgeButton
                drawing={{ activate: vi.fn(() => true) }}
                kind="flow"
                label="Flow"
                preset="flowchart"
                session={new FlowEdgeSessionStub(diagramType, 'flowchart')}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Flow' })).not.toBeInTheDocument();
    });

    it('appears once the flow diagram switches to the matching preset', () => {
        const session = new FlowEdgeSessionStub('flow', 'flowchart');
        render(
            <DiagramFlowEdgeButton
                drawing={{ activate: vi.fn(() => true) }}
                kind="transition"
                label="Transition"
                preset="state"
                session={session}
            />,
        );
        expect(screen.queryByRole('button', { name: 'Transition' })).not.toBeInTheDocument();

        act(() => { session.setFlowPreset('state'); });

        expect(screen.getByRole('button', { name: 'Transition' })).toBeInTheDocument();
    });
});

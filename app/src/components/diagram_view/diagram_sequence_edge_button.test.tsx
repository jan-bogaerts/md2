import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramType } from '../../services/diagrams/diagram_data';
import type { DiagramPersistentTool } from '../../services/diagrams/diagram_edit_session_service';
import {
    DiagramSequenceEdgeButton,
    type DiagramSequenceEdgeDrawing,
} from './diagram_sequence_edge_button';

class SequenceEdgeSessionStub extends EventTarget {
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

describe('DiagramSequenceEdgeButton', () => {
    it.each([
        ['Call', 'call'],
        ['Return', 'return'],
        ['Async', 'async'],
        ['Success', 'success'],
    ] as const)('activates %s through shared drawing', (label, kind) => {
        const session = new SequenceEdgeSessionStub('sequence');
        const drawing: DiagramSequenceEdgeDrawing = { activate: vi.fn(() => true) };
        render(<DiagramSequenceEdgeButton drawing={drawing} kind={kind} label={label} session={session} />);
        const button = screen.getByRole('button', { name: label });

        fireEvent.click(button);

        expect(drawing.activate).toHaveBeenCalledWith({ kind });
        act(() => { session.setActiveTool(`edge:${kind}`); });
        expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it.each(['architecture', 'dependency', 'flow', 'entity'] as const)('is absent for %s diagrams', (diagramType) => {
        render(
            <DiagramSequenceEdgeButton
                drawing={{ activate: vi.fn(() => true) }}
                kind="call"
                label="Call"
                session={new SequenceEdgeSessionStub(diagramType)}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Call' })).not.toBeInTheDocument();
    });
});

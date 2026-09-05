import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramType } from '../../services/diagrams/diagram_data';
import type { DiagramPersistentTool } from '../../services/diagrams/diagram_edit_session_service';
import {
    DiagramArchitectureEdgeButton,
    type DiagramArchitectureEdgeDrawing,
} from './diagram_architecture_edge_button';

class ArchitectureEdgeSessionStub extends EventTarget {
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

describe('DiagramArchitectureEdgeButton', () => {
    it.each([
        ['Connection', 'connection'],
        ['Data', 'data'],
        ['Async', 'async'],
    ] as const)('activates %s through shared drawing', (label, kind) => {
        const session = new ArchitectureEdgeSessionStub('architecture');
        const drawing: DiagramArchitectureEdgeDrawing = { activate: vi.fn(() => true) };
        render(<DiagramArchitectureEdgeButton drawing={drawing} kind={kind} label={label} session={session} />);
        const button = screen.getByRole('button', { name: label });

        fireEvent.click(button);

        expect(drawing.activate).toHaveBeenCalledWith({ kind });
        expect(session.subscribeMetadataField).toHaveBeenCalledWith('type', expect.any(Function));
        act(() => { session.setActiveTool(`edge:${kind}`); });
        expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it.each(['dependency', 'sequence', 'flow', 'entity'] as const)('is absent for %s diagrams', (diagramType) => {
        render(
            <DiagramArchitectureEdgeButton
                drawing={{ activate: vi.fn(() => true) }}
                kind="connection"
                label="Connection"
                session={new ArchitectureEdgeSessionStub(diagramType)}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Connection' })).not.toBeInTheDocument();
    });
});

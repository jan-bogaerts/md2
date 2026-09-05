import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramType } from '../../services/diagrams/diagram_data';
import type { DiagramPersistentTool } from '../../services/diagrams/diagram_edit_session_service';
import {
    DiagramDependencyEdgeButton,
    type DiagramDependencyEdgeDrawing,
} from './diagram_dependency_edge_button';

class DependencyEdgeSessionStub extends EventTarget {
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

describe('DiagramDependencyEdgeButton', () => {
    it.each([
        ['Dependency', 'dependency'],
        ['Cycle', 'cycle'],
    ] as const)('activates %s through shared drawing', (label, kind) => {
        const session = new DependencyEdgeSessionStub('dependency');
        const drawing: DiagramDependencyEdgeDrawing = { activate: vi.fn(() => true) };
        render(<DiagramDependencyEdgeButton drawing={drawing} kind={kind} label={label} session={session} />);
        const button = screen.getByRole('button', { name: label });

        fireEvent.click(button);

        expect(drawing.activate).toHaveBeenCalledWith({ kind });
        expect(session.subscribeMetadataField).toHaveBeenCalledWith('type', expect.any(Function));
        act(() => { session.setActiveTool(`edge:${kind}`); });
        expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it.each(['architecture', 'sequence', 'flow', 'entity'] as const)('is absent for %s diagrams', (diagramType) => {
        render(
            <DiagramDependencyEdgeButton
                drawing={{ activate: vi.fn(() => true) }}
                kind="dependency"
                label="Dependency"
                session={new DependencyEdgeSessionStub(diagramType)}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Dependency' })).not.toBeInTheDocument();
    });
});

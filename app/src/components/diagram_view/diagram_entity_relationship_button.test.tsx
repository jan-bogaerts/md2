import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramType } from '../../services/diagrams/diagram_data';
import type { DiagramPersistentTool } from '../../services/diagrams/diagram_edit_session_service';
import {
    DiagramEntityRelationshipButton,
    type DiagramEntityRelationshipDrawing,
} from './diagram_entity_relationship_button';

class EntityRelationshipSessionStub extends EventTarget {
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

describe('DiagramEntityRelationshipButton', () => {
    it('activates relationship drawing and reflects active state', () => {
        const session = new EntityRelationshipSessionStub('entity');
        const drawing: DiagramEntityRelationshipDrawing = { activate: vi.fn(() => true) };
        render(<DiagramEntityRelationshipButton drawing={drawing} session={session} />);
        const button = screen.getByRole('button', { name: 'Relationship' });

        fireEvent.click(button);

        expect(drawing.activate).toHaveBeenCalledWith({ kind: 'relationship' });
        expect(session.subscribeMetadataField).toHaveBeenCalledWith('type', expect.any(Function));
        act(() => { session.setActiveTool('edge:relationship'); });
        expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it.each(['architecture', 'dependency', 'sequence', 'flow'] as const)('is absent for %s diagrams', (diagramType) => {
        render(
            <DiagramEntityRelationshipButton
                drawing={{ activate: vi.fn(() => true) }}
                session={new EntityRelationshipSessionStub(diagramType)}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Relationship' })).not.toBeInTheDocument();
    });
});

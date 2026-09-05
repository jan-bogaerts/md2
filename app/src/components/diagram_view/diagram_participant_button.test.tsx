import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramType } from '../../services/diagrams/diagram_data';
import type { DiagramPersistentTool } from '../../services/diagrams/diagram_edit_session_service';
import { DiagramParticipantButton } from './diagram_participant_button';

class ParticipantSessionStub extends EventTarget {
    private activeTool: DiagramPersistentTool;
    private diagramType: DiagramType | null;

    constructor(diagramType: DiagramType | null, activeTool: DiagramPersistentTool = 'select') {
        super();
        this.activeTool = activeTool;
        this.diagramType = diagramType;
    }

    readonly getActiveToolSnapshot = () => this.activeTool;
    readonly getMetadataFieldSnapshot = (field: 'type') => {
        void field;

        return this.diagramType;
    };

    readonly subscribeActiveTool = (listener: () => void) => {
        this.addEventListener('toolChanged', listener);

        return () => this.removeEventListener('toolChanged', listener);
    };

    readonly subscribeMetadataField = (_field: 'type', listener: () => void) => {
        this.addEventListener('typeChanged', listener);

        return () => this.removeEventListener('typeChanged', listener);
    };

    readonly subscribeSession = (listener: () => void) => {
        this.addEventListener('sessionChanged', listener);

        return () => this.removeEventListener('sessionChanged', listener);
    };

    setDiagramType(diagramType: DiagramType | null) {
        this.diagramType = diagramType;
        this.dispatchEvent(new Event('typeChanged'));
    }
}

afterEach(() => cleanup());

describe('DiagramParticipantButton', () => {
    it('activates participant placement with valid defaults for sequence diagrams', async () => {
        const activate = vi.fn();
        render(
            <DiagramParticipantButton
                placement={{ activate }}
                session={new ParticipantSessionStub('sequence')}
            />,
        );
        const button = screen.getByRole('button', { name: 'Participant' });

        expect(button).toHaveAttribute('aria-pressed', 'false');
        fireEvent.mouseOver(button);
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Place participant');
        fireEvent.click(button);

        expect(activate).toHaveBeenCalledExactlyOnceWith({
            defaults: { height: 72, label: 'New participant', role: 'focal', width: 160 },
            kind: 'participant',
        });
    });

    it('tracks sequence availability from only the diagram type', () => {
        const session = new ParticipantSessionStub('architecture');
        render(<DiagramParticipantButton placement={{ activate: vi.fn() }} session={session} />);

        expect(screen.queryByRole('button', { name: 'Participant' })).not.toBeInTheDocument();

        act(() => session.setDiagramType('sequence'));
        expect(screen.getByRole('button', { name: 'Participant' })).toBeInTheDocument();

        act(() => session.setDiagramType('dependency'));
        expect(screen.queryByRole('button', { name: 'Participant' })).not.toBeInTheDocument();
    });

    it('shows active placement state', () => {
        const session = new ParticipantSessionStub('sequence', 'node:participant');
        render(<DiagramParticipantButton placement={{ activate: vi.fn() }} session={session} />);

        expect(screen.getByRole('button', { name: 'Participant' })).toHaveAttribute('aria-pressed', 'true');
    });
});

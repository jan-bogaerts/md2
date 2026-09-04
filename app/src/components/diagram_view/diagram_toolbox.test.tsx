import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramToolboxSection } from '../../services/diagrams/diagram_edit_session_service';
import { DiagramToolbox } from './diagram_toolbox';
import { DiagramToolboxButton } from './diagram_toolbox_button';

class ToolboxSessionStub extends EventTarget {
    private activeSection: DiagramToolboxSection = 'edit';

    readonly getActiveToolboxSectionSnapshot = () => this.activeSection;

    readonly subscribeActiveToolboxSection = (listener: () => void) => {
        this.addEventListener('sectionChanged', listener);

        return () => this.removeEventListener('sectionChanged', listener);
    };

    setActiveToolboxSection(section: DiagramToolboxSection) {
        this.activeSection = section;
        this.dispatchEvent(new Event('sectionChanged'));
    }
}

function createBoundary() {
    const boundaryElement = document.createElement('div');
    vi.spyOn(boundaryElement, 'getBoundingClientRect').mockReturnValue({
        bottom: 500,
        height: 500,
        left: 0,
        right: 700,
        toJSON: () => ({}),
        top: 0,
        width: 700,
        x: 0,
        y: 0,
    });

    return boundaryElement;
}

afterEach(() => {
    cleanup();
    window.localStorage.removeItem('md2.diagramToolboxSize');
    vi.restoreAllMocks();
});

describe('DiagramToolbox', () => {
    it('renders labelled tabs and publishes only active section changes', async () => {
        const session = new ToolboxSessionStub();
        render(<DiagramToolbox boundaryElement={createBoundary()} session={session} />);

        expect(screen.getByRole('dialog', { name: 'Diagram tools' })).toBeInTheDocument();
        expect(screen.getAllByRole('tab').map(({ textContent }) => textContent)).toEqual([
            'Edit', 'Nodes', 'Edges', 'Groups', 'Others',
        ]);
        expect(screen.getByRole('tab', { name: 'Edit' })).toHaveAttribute('aria-selected', 'true');

        fireEvent.mouseOver(screen.getByRole('tab', { name: 'Nodes' }));
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Nodes');
        fireEvent.click(screen.getByRole('tab', { name: 'Nodes' }));

        expect(session.getActiveToolboxSectionSnapshot()).toBe('nodes');
        expect(screen.getByRole('tab', { name: 'Nodes' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel')).toHaveStyle({ display: 'flex', flexWrap: 'wrap' });
    });

    it('exposes accessible resize handles on every side and corner', () => {
        render(<DiagramToolbox boundaryElement={createBoundary()} session={new ToolboxSessionStub()} />);

        expect(screen.getAllByRole('separator', { name: /Resize diagram toolbox from/u })).toHaveLength(8);
    });

    it('restores its retained size while the edit session remains active', () => {
        window.localStorage.setItem('md2.diagramToolboxSize', JSON.stringify({ height: 180, width: 320 }));

        render(<DiagramToolbox boundaryElement={createBoundary()} session={new ToolboxSessionStub()} />);

        expect(screen.getByRole('dialog', { name: 'Diagram tools' })).toHaveStyle({ height: '180px', width: '320px' });
    });
});

describe('DiagramToolboxButton', () => {
    it('shows visible and accessible labels, tooltip, and active state', async () => {
        const onActivate = vi.fn();
        render(
            <DiagramToolboxButton
                active
                label="Select"
                onActivate={onActivate}
                tooltip="Select diagram objects"
            />,
        );
        const button = screen.getByRole('button', { name: 'Select' });

        expect(button).toHaveTextContent('Select');
        expect(button).toHaveAttribute('aria-pressed', 'true');
        fireEvent.mouseOver(button);
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Select diagram objects');
        fireEvent.click(button);
        expect(onActivate).toHaveBeenCalledOnce();
    });
});

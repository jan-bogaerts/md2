import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
    DiagramPersistentTool,
    DiagramTransientGesture,
    DiagramToolboxSection,
} from '../../services/diagrams/diagram_edit_session_service';
import {
    DEFAULT_DIAGRAM_ZOOM,
    DIAGRAM_ZOOM_STEP,
    MAXIMUM_DIAGRAM_ZOOM,
    MINIMUM_DIAGRAM_ZOOM,
} from '../../services/diagrams/diagram_edit_session_service';
import { DiagramToolbox } from './diagram_toolbox';
import { DiagramToolboxActionButton } from './diagram_toolbox_action_button';
import { DiagramToolboxButton } from './diagram_toolbox_button';

class ToolboxSessionStub extends EventTarget {
    private activeSection: DiagramToolboxSection = 'edit';
    private activeTool: DiagramPersistentTool = 'select';
    private transientGesture: DiagramTransientGesture | null = null;
    private viewportScale = DEFAULT_DIAGRAM_ZOOM;

    readonly getActiveToolboxSectionSnapshot = () => this.activeSection;
    readonly getActiveToolSnapshot = () => this.activeTool;
    readonly getTransientGestureSnapshot = () => this.transientGesture;
    readonly getViewportScaleSnapshot = () => this.viewportScale;

    readonly subscribeActiveTool = (listener: () => void) => {
        this.addEventListener('toolChanged', listener);

        return () => this.removeEventListener('toolChanged', listener);
    };

    readonly subscribeActiveToolboxSection = (listener: () => void) => {
        this.addEventListener('sectionChanged', listener);

        return () => this.removeEventListener('sectionChanged', listener);
    };

    readonly subscribeTransientGesture = (listener: () => void) => {
        this.addEventListener('gestureChanged', listener);

        return () => this.removeEventListener('gestureChanged', listener);
    };

    readonly subscribeViewportScale = (listener: () => void) => {
        this.addEventListener('viewportScaleChanged', listener);

        return () => this.removeEventListener('viewportScaleChanged', listener);
    };

    setActiveTool(tool: DiagramPersistentTool) {
        this.activeTool = tool;
        this.transientGesture = null;
        this.dispatchEvent(new Event('toolChanged'));
        this.dispatchEvent(new Event('gestureChanged'));
    }

    beginTransientGesture(gesture: DiagramTransientGesture) {
        this.transientGesture = gesture;
        this.dispatchEvent(new Event('gestureChanged'));
    }

    cancelActiveInteraction() {
        const changed = this.activeTool !== 'select' || this.transientGesture !== null;
        this.activeTool = 'select';
        this.transientGesture = null;
        if (changed) {
            this.dispatchEvent(new Event('toolChanged'));
            this.dispatchEvent(new Event('gestureChanged'));
        }

        return changed;
    }

    setActiveToolboxSection(section: DiagramToolboxSection) {
        this.activeSection = section;
        this.dispatchEvent(new Event('sectionChanged'));
    }

    zoomIn() {
        const viewportScale = Math.min(this.viewportScale + DIAGRAM_ZOOM_STEP, MAXIMUM_DIAGRAM_ZOOM);
        if (viewportScale === this.viewportScale) return false;

        this.viewportScale = viewportScale;
        this.dispatchEvent(new Event('viewportScaleChanged'));

        return true;
    }

    zoomOut() {
        const viewportScale = Math.max(this.viewportScale - DIAGRAM_ZOOM_STEP, MINIMUM_DIAGRAM_ZOOM);
        if (viewportScale === this.viewportScale) return false;

        this.viewportScale = viewportScale;
        this.dispatchEvent(new Event('viewportScaleChanged'));

        return true;
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
        expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Zoom in' })).not.toHaveAttribute('aria-pressed');
        expect(screen.getByRole('button', { name: 'Zoom out' })).not.toHaveAttribute('aria-pressed');

        fireEvent.mouseOver(screen.getByRole('tab', { name: 'Nodes' }));
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Nodes');
        fireEvent.click(screen.getByRole('tab', { name: 'Nodes' }));

        expect(session.getActiveToolboxSectionSnapshot()).toBe('nodes');
        expect(screen.getByRole('tab', { name: 'Nodes' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel')).toHaveStyle({ display: 'flex', flexWrap: 'wrap' });
        expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
    });

    it('zooms by one step without changing persistent tool and disables at maximum', async () => {
        const session = new ToolboxSessionStub();
        session.setActiveTool('node:component');
        render(<DiagramToolbox boundaryElement={createBoundary()} session={session} />);
        const button = screen.getByRole('button', { name: 'Zoom in' });

        fireEvent.mouseOver(button);
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Zoom in');
        fireEvent.click(button);
        expect(session.getViewportScaleSnapshot()).toBe(DEFAULT_DIAGRAM_ZOOM + DIAGRAM_ZOOM_STEP);
        expect(session.getActiveToolSnapshot()).toBe('node:component');

        const remainingSteps = (MAXIMUM_DIAGRAM_ZOOM - session.getViewportScaleSnapshot()) / DIAGRAM_ZOOM_STEP;
        Array.from({ length: remainingSteps }).forEach(() => fireEvent.click(button));
        expect(session.getViewportScaleSnapshot()).toBe(MAXIMUM_DIAGRAM_ZOOM);
        expect(button).toBeDisabled();
    });

    it('zooms out by one step without changing persistent tool and disables at minimum', async () => {
        const session = new ToolboxSessionStub();
        session.setActiveTool('node:component');
        render(<DiagramToolbox boundaryElement={createBoundary()} session={session} />);
        const button = screen.getByRole('button', { name: 'Zoom out' });

        fireEvent.mouseOver(button);
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Zoom out');
        fireEvent.click(button);
        expect(session.getViewportScaleSnapshot()).toBe(DEFAULT_DIAGRAM_ZOOM - DIAGRAM_ZOOM_STEP);
        expect(session.getActiveToolSnapshot()).toBe('node:component');

        const remainingSteps = (session.getViewportScaleSnapshot() - MINIMUM_DIAGRAM_ZOOM) / DIAGRAM_ZOOM_STEP;
        Array.from({ length: remainingSteps }).forEach(() => fireEvent.click(button));
        expect(session.getViewportScaleSnapshot()).toBe(MINIMUM_DIAGRAM_ZOOM);
        expect(button).toBeDisabled();
    });

    it('returns to Select when Escape cancels an active gesture', () => {
        const session = new ToolboxSessionStub();
        session.setActiveTool('node:component');
        session.beginTransientGesture('placement');
        render(<DiagramToolbox boundaryElement={createBoundary()} session={session} />);

        fireEvent.keyDown(window, { key: 'Escape' });

        expect(session.getActiveToolSnapshot()).toBe('select');
        expect(session.getTransientGestureSnapshot()).toBeNull();
        expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
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

    it('executes one-shot action without exposing persistent mode state', () => {
        const session = new ToolboxSessionStub();
        session.setActiveTool('node:component');
        const onActivate = vi.fn();
        render(
            <DiagramToolboxActionButton
                label="Zoom in"
                onActivate={onActivate}
                tooltip="Zoom in"
            />,
        );
        const button = screen.getByRole('button', { name: 'Zoom in' });

        expect(button).not.toHaveAttribute('aria-pressed');
        fireEvent.click(button);
        expect(onActivate).toHaveBeenCalledOnce();
        expect(session.getActiveToolSnapshot()).toBe('node:component');
        expect(button).not.toHaveAttribute('aria-pressed');
    });
});

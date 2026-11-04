import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDiagramData, type DiagramData } from '../../../services/diagrams/diagram_data';
import { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service';
import type { DiagramRecord } from '../../../services/diagrams/diagram_index';
import type { DiagramViewSourceSnapshot } from '../../../services/diagrams/diagram_view_service';
import { DiagramBreadcrumbMetadataField } from './diagram_breadcrumb_metadata_field';
import type { DiagramRootMenuService } from './diagram_root_menu_dropdown_button';

const diagram: DiagramData = {
    edges: [],
    groups: [],
    meta: { description: 'Orders architecture', legend: [], title: 'Overview', type: 'architecture', version: 3 },
    nodes: [],
};
const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' };
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' };

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot = { diagram: parseDiagramData(JSON.stringify(diagram)), record };

    getSourceSnapshot = () => this.source;

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener);

        return () => this.removeEventListener('sourceChanged', listener);
    };
}

class RootMenuStub extends EventTarget implements DiagramRootMenuService {
    private rootMenu: { anchorElement: HTMLElement } | null = null;

    getRootMenuSnapshot = () => this.rootMenu;

    openRootMenu = vi.fn((anchorElement: HTMLElement) => {
        this.rootMenu = { anchorElement };
        this.dispatchEvent(new Event('rootMenuChanged'));
    });

    subscribeRootMenu = (listener: () => void) => {
        this.addEventListener('rootMenuChanged', listener);

        return () => this.removeEventListener('rootMenuChanged', listener);
    };
}

function createSession() {
    const session = new DiagramEditSessionService(new DiagramSourceStub());
    session.bindProject(project);
    session.start();

    return session;
}

afterEach(cleanup);

describe('DiagramBreadcrumbMetadataField', () => {
    it('trims and commits title on Enter and subtitle on blur', async () => {
        const session = createSession();
        const user = userEvent.setup();
        render(<><DiagramBreadcrumbMetadataField field="title" session={session} /><DiagramBreadcrumbMetadataField field="description" session={session} /></>);
        const title = screen.getByRole('textbox', { name: 'Diagram title' });
        const subtitle = screen.getByRole('textbox', { name: 'Diagram subtitle' });

        await user.clear(title);
        await user.type(title, '  Revised overview  {Enter}');
        await user.clear(subtitle);
        await user.type(subtitle, 'Revised description');
        await user.tab();

        expect(session.read.getMetadataFieldSnapshot('title')).toBe('Revised overview');
        expect(session.read.getMetadataFieldSnapshot('description')).toBe('Revised description');
        expect(session.read.getDirtySnapshot()).toBe(true);
    });

    it('keeps Enter as a subtitle newline and commits on Ctrl+Enter', async () => {
        const session = createSession();
        const user = userEvent.setup();
        render(<DiagramBreadcrumbMetadataField field="description" session={session} />);
        const subtitle = screen.getByRole('textbox', { name: 'Diagram subtitle' });

        await user.type(subtitle, '{Enter}more');
        expect(session.read.getMetadataFieldSnapshot('description')).toBe('Orders architecture');
        await user.keyboard('{Control>}{Enter}{/Control}');

        expect(session.read.getMetadataFieldSnapshot('description')).toBe('Orders architecture\nmore');
    });

    it.each([
        ['title', 'Diagram title', 'Title is required.', 'Overview'],
        ['description', 'Diagram subtitle', 'Subtitle is required.', 'Orders architecture'],
    ] as const)('rejects blank %s without replacing stored value', async (field, label, message, stored) => {
        const session = createSession();
        const user = userEvent.setup();
        render(<DiagramBreadcrumbMetadataField field={field} session={session} />);

        await user.clear(screen.getByRole('textbox', { name: label }));
        await user.tab();

        expect(screen.getByText(message)).toBeInTheDocument();
        expect(session.read.getMetadataFieldSnapshot(field)).toBe(stored);
    });

    it('restores stored value on Escape without committing draft', async () => {
        const session = createSession();
        const user = userEvent.setup();
        render(<DiagramBreadcrumbMetadataField field="title" session={session} />);
        const title = screen.getByRole('textbox', { name: 'Diagram title' });

        await user.type(title, ' draft{Escape}');
        await user.tab();

        expect(title).toHaveValue('Overview');
        expect(session.read.getMetadataFieldSnapshot('title')).toBe('Overview');
    });

    it('opens root menu from the dropdown icon without committing title text', async () => {
        const session = createSession();
        const rootMenu = new RootMenuStub();
        const user = userEvent.setup();
        render(<DiagramBreadcrumbMetadataField field="title" rootMenuService={rootMenu} session={session} />);
        const title = screen.getByRole('textbox', { name: 'Diagram title' });
        const dropdown = screen.getByRole('button', { name: 'Open root diagrams' });

        await user.type(title, ' draft');
        expect(dropdown).toHaveAttribute('aria-haspopup', 'menu');
        expect(dropdown).toHaveAttribute('aria-expanded', 'false');
        await user.click(dropdown);

        expect(rootMenu.openRootMenu).toHaveBeenCalledWith(dropdown);
        expect(dropdown).toHaveAttribute('aria-expanded', 'true');
        expect(title).toHaveValue('Overview draft');
        expect(session.read.getMetadataFieldSnapshot('title')).toBe('Overview');
    });
});

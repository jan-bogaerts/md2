import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionDefinition } from '../../../data/action_types';
import { parseDiagramData, type DiagramData } from '../../../services/diagrams/diagram_data';
import { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service';
import type { DiagramIndex, DiagramRecord } from '../../../services/diagrams/diagram_index';
import { layout, type PositionedDiagramData } from '../../../services/diagrams/diagram_layout';
import { DiagramSelectionService } from '../../../services/diagrams/diagram_selection_service';
import type {
    CurrentDiagramSelection, DiagramRootMenuState, DiagramViewService, DiagramViewSourceSnapshot,
} from '../../../services/diagrams/diagram_view_service';
import { DiagramBreadcrumbBar } from './diagram_breadcrumb_bar';

const actions = vi.hoisted(() => [
    { appliesTo: { kind: 'diagram', type: 'root' }, builtin: false, id: 'overview', label: 'Overview' },
]) as ActionDefinition[];

vi.mock('../../hooks/use_actions', () => ({ useActions: () => ({ actions }) }));

const rootRecord: DiagramRecord = { actionId: 'overview', id: 'root-1', label: 'Overview', path: 'design/diagrams/root.json' };
const childRecord: DiagramRecord = {
    actionId: 'detail', id: 'child-1', label: 'Orders',
    parent: { diagramId: 'root-1', itemId: 'orders', itemLabel: 'Orders' }, path: 'design/diagrams/child.json',
};
const otherRecord: DiagramRecord = { actionId: 'overview', id: 'root-2', label: 'Dependencies', path: 'design/diagrams/dependencies.json' };
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' };

function diagramData(title: string, description: string): DiagramData {
    return { edges: [], groups: [], meta: { description, legend: [], title, type: 'architecture', version: 3 }, nodes: [] };
}

function architectureDiagram(): DiagramData {
    return {
        edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', legendEntryId: 'connection', to: 'store' }],
        groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
        meta: {
            description: 'Orders architecture',
            legend: [
                { id: 'focal', label: 'Focal', role: 'focal' },
                { id: 'store', label: 'Store', role: 'store' },
                { id: 'connection', kind: 'connection', label: 'Connection', useLabelAsDefault: false },
            ],
            title: 'Orders',
            type: 'architecture',
            version: 3,
        },
        nodes: [
            { id: 'orders', label: 'Orders', legendEntryId: 'focal', role: 'focal' },
            { id: 'store', label: 'Store', legendEntryId: 'store', role: 'store' },
        ],
    };
}

function mindmapDiagram(): DiagramData {
    return {
        edges: [{ from: 'root', id: 'root-topic', kind: 'connection', legendEntryId: 'connection', to: 'topic' }],
        groups: [],
        meta: {
            description: 'Ideas',
            legend: [
                { id: 'root', label: 'Root', nodeKind: 'root' },
                { id: 'topic', label: 'Topic', nodeKind: 'topic' },
                { id: 'connection', kind: 'connection', label: 'Connection', useLabelAsDefault: false },
            ],
            title: 'Ideas',
            type: 'mindmap',
            version: 3,
        },
        nodes: [
            { height: 128, id: 'root', kind: 'root', label: 'Root', legendEntryId: 'root', role: 'focal', width: 128 },
            { height: 96, id: 'topic', kind: 'topic', label: 'Persisted topic', legendEntryId: 'topic', role: 'backend', width: 96 },
        ],
    };
}

function diagramIndex(activePath: string[]): DiagramIndex {
    return {
        activePath,
        children: {},
        diagrams: { 'child-1': childRecord, 'root-1': rootRecord, 'root-2': otherRecord },
        roots: { overview: ['root-1', 'root-2'] },
        version: 1,
    };
}

/** Minimal view service exposing the breadcrumb bar's subscriptions and navigation commands. */
class ViewServiceStub extends EventTarget {
    private currentDiagram: PositionedDiagramData;
    private currentSelectedItem: CurrentDiagramSelection | null = null;
    private index: DiagramIndex;
    private readonly rootDiagrams = [rootRecord, otherRecord];
    private rootMenu: DiagramRootMenuState | null = null;

    constructor(activePath: string[], data: DiagramData) {
        super();
        this.index = diagramIndex(activePath);
        this.currentDiagram = layout(data);
    }

    getCurrentDiagramSnapshot = () => this.currentDiagram;
    getCurrentSelectedItemSnapshot = () => this.currentSelectedItem;
    getIndexSnapshot = () => this.index;
    getRootDiagrams = () => this.rootDiagrams;
    getRootMenuSnapshot = () => this.rootMenu;
    closeRootMenu = vi.fn(() => this.setRootMenu(null));
    navigateBack = vi.fn(async () => {});
    navigateToCrumb = vi.fn(async () => {});
    navigateToSavedDiagram = vi.fn(async () => {});
    openNewRootPopup = vi.fn();
    openRootMenu = vi.fn((anchorElement: HTMLElement) => this.setRootMenu({ anchorElement }));
    openSelectedItemPopup = vi.fn();

    navigate(activePath: string[], data: DiagramData) {
        this.index = diagramIndex(activePath);
        this.currentDiagram = layout(data);
        this.dispatchEvent(new Event('index'));
        this.dispatchEvent(new Event('currentDiagram'));
    }

    selectCurrent(selection: CurrentDiagramSelection | null) {
        this.currentSelectedItem = selection;
        this.dispatchEvent(new Event('currentSelectedItem'));
    }

    subscribeCurrentDiagram = (listener: () => void) => this.listen('currentDiagram', listener);
    subscribeCurrentSelectedItem = (listener: () => void) => this.listen('currentSelectedItem', listener);
    subscribeIndex = (listener: () => void) => this.listen('index', listener);
    subscribeRootMenu = (listener: () => void) => this.listen('rootMenu', listener);

    private listen(type: string, listener: () => void) {
        this.addEventListener(type, listener);

        return () => this.removeEventListener(type, listener);
    }

    private setRootMenu(rootMenu: DiagramRootMenuState | null) {
        this.rootMenu = rootMenu;
        this.dispatchEvent(new Event('rootMenu'));
    }
}

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot;

    constructor(record: DiagramRecord, data: DiagramData) {
        super();
        this.source = { diagram: parseDiagramData(JSON.stringify(data)), record };
    }

    getSourceSnapshot = () => this.source;

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener);

        return () => this.removeEventListener('sourceChanged', listener);
    };
}

function createEditSession(record: DiagramRecord, data: DiagramData) {
    const session = new DiagramEditSessionService(new DiagramSourceStub(record, data));
    session.bindProject(project);
    session.start();

    return session;
}

function renderBar(
    stub: ViewServiceStub,
    session: DiagramEditSessionService,
    selection = new DiagramSelectionService(session),
) {
    return {
        ...render(
            <DiagramBreadcrumbBar
                selection={selection}
                service={stub as unknown as DiagramViewService}
                session={session}
            />,
        ),
        selection,
    };
}

afterEach(cleanup);

describe('DiagramBreadcrumbBar', () => {
    it('shows final title and exactly one Current subtitle in view mode', () => {
        const data = diagramData('Orders', 'Customer ordering flow');
        const stub = new ViewServiceStub(['root-1', 'child-1'], data);
        renderBar(stub, new DiagramEditSessionService(new DiagramSourceStub(childRecord, data)));
        const breadcrumb = screen.getByLabelText('Diagram breadcrumb');

        expect(within(breadcrumb).getByRole('button', { name: 'Orders' })).toBeDisabled();
        expect(screen.getAllByLabelText('Diagram subtitle')).toHaveLength(1);
        expect(screen.getByLabelText('Diagram subtitle')).toHaveTextContent('Customer ordering flow');
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('replaces title and subtitle when navigating to another diagram', () => {
        const stub = new ViewServiceStub(['root-1', 'child-1'], diagramData('Orders', 'Customer ordering flow'));
        renderBar(stub, new DiagramEditSessionService(new DiagramSourceStub(childRecord, diagramData('Orders', 'Customer ordering flow'))));

        act(() => stub.navigate(['root-2'], diagramData('Dependencies', 'Module dependencies')));

        expect(within(screen.getByLabelText('Diagram breadcrumb')).getByRole('button', { name: 'Dependencies' })).toBeInTheDocument();
        expect(screen.getAllByLabelText('Diagram subtitle')).toHaveLength(1);
        expect(screen.getByLabelText('Diagram subtitle')).toHaveTextContent('Module dependencies');
        expect(screen.queryByText('Customer ordering flow')).not.toBeInTheDocument();
    });

    it('edits only the final title and subtitle while ancestors keep navigating', async () => {
        const data = diagramData('Orders', 'Customer ordering flow');
        const stub = new ViewServiceStub(['root-1', 'child-1'], data);
        const session = createEditSession(childRecord, data);
        const user = userEvent.setup();
        renderBar(stub, session);
        const title = screen.getByRole('textbox', { name: 'Diagram title' });
        const subtitle = screen.getByRole('textbox', { name: 'Diagram subtitle' });

        expect(screen.getAllByRole('textbox')).toHaveLength(2);
        expect(title).toHaveValue('Orders');
        expect(subtitle).toHaveValue('Customer ordering flow');
        expect(screen.queryByRole('button', { name: 'Open root diagrams' })).not.toBeInTheDocument();
        await user.clear(title);
        await user.type(title, 'Purchases{Enter}');
        expect(session.read.getMetadataFieldSnapshot('title')).toBe('Purchases');

        await user.click(screen.getByRole('button', { name: 'Overview' }));
        expect(stub.openRootMenu).toHaveBeenCalledOnce();
    });

    it('shows draft metadata from the edit session immediately', () => {
        const data = diagramData('Orders', 'Customer ordering flow');
        const session = createEditSession(childRecord, data);
        renderBar(new ViewServiceStub(['root-1', 'child-1'], data), session);

        act(() => {
            session.objects.setMetadataField('title', 'Draft title');
            session.objects.setMetadataField('description', 'Draft subtitle');
        });

        expect(screen.getByRole('textbox', { name: 'Diagram title' })).toHaveValue('Draft title');
        expect(screen.getByRole('textbox', { name: 'Diagram subtitle' })).toHaveValue('Draft subtitle');
    });

    it('rejects blank subtitle and keeps stored value', async () => {
        const data = diagramData('Orders', 'Customer ordering flow');
        const session = createEditSession(childRecord, data);
        const user = userEvent.setup();
        renderBar(new ViewServiceStub(['root-1', 'child-1'], data), session);

        await user.clear(screen.getByRole('textbox', { name: 'Diagram subtitle' }));
        await user.tab();

        expect(screen.getByText('Subtitle is required.')).toBeInTheDocument();
        expect(session.read.getMetadataFieldSnapshot('description')).toBe('Customer ordering flow');
    });

    it('opens saved-root menu from root title dropdown without committing title text', async () => {
        const data = diagramData('Overview', 'System overview');
        const stub = new ViewServiceStub(['root-1'], data);
        const session = createEditSession(rootRecord, data);
        const user = userEvent.setup();
        renderBar(stub, session);
        const title = screen.getByRole('textbox', { name: 'Diagram title' });
        const dropdown = screen.getByRole('button', { name: 'Open root diagrams' });

        await user.type(title, ' draft');
        await user.click(dropdown);

        const rootMenu = await screen.findByRole('menu', { name: 'Root diagrams' });
        expect(within(rootMenu).getAllByRole('menuitem', { name: 'Overview' })).toHaveLength(2);
        expect(dropdown).toHaveAttribute('aria-expanded', 'true');
        expect(title).toHaveValue('Overview draft');
        expect(session.read.getMetadataFieldSnapshot('title')).toBe('Overview');
    });

    it('opens a child action for one persisted node selected in an editable mind map', async () => {
        const data = mindmapDiagram();
        const stub = new ViewServiceStub(['root-1'], data);
        const session = createEditSession(rootRecord, data);
        const { selection } = renderBar(stub, session);
        const user = userEvent.setup();

        act(() => {
            session.objects.setNodeField('topic', 'label', 'Draft topic');
            selection.replace([{ objectId: 'topic', objectKind: 'node' }]);
        });
        const add = screen.getByRole('button', { name: 'Add child diagram' });
        expect(add).toBeEnabled();

        await user.click(add);

        const persistedTopic = { activeDiagramId: 'root-1', itemId: 'topic', itemLabel: 'Persisted topic', objectKind: 'node' };
        expect(stub.openSelectedItemPopup).toHaveBeenCalledWith(expect.any(HTMLElement), persistedTopic);
    });

    it('opens a child action for a persisted connection in another editable diagram type', async () => {
        const data = architectureDiagram();
        const stub = new ViewServiceStub(['root-1'], data);
        const session = createEditSession(rootRecord, data);
        const { selection } = renderBar(stub, session);
        const user = userEvent.setup();

        act(() => selection.replace([{ objectId: 'orders-store', objectKind: 'edge' }]));
        await user.click(screen.getByRole('button', { name: 'Add child diagram' }));

        const persistedConnection = { activeDiagramId: 'root-1', itemId: 'orders-store', itemLabel: 'Orders to Store', objectKind: 'edge' };
        expect(stub.openSelectedItemPopup).toHaveBeenCalledWith(expect.any(HTMLElement), persistedConnection);
    });

    it('uses Current selection when an active editor has no selection', async () => {
        const data = architectureDiagram();
        const stub = new ViewServiceStub(['root-1'], data);
        const session = createEditSession(rootRecord, data);
        const currentSelection = { activeDiagramId: 'root-1', itemId: 'orders', itemLabel: 'Orders', objectKind: 'node' } as const;
        stub.selectCurrent(currentSelection);
        renderBar(stub, session);
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Add child diagram' }));

        expect(stub.openSelectedItemPopup).toHaveBeenCalledWith(expect.any(HTMLElement), currentSelection);
    });

    it.each([
        ['multiple objects', [
            { objectId: 'orders', objectKind: 'node' },
            { objectId: 'store', objectKind: 'node' },
        ]],
        ['a group', [{ objectId: 'backend', objectKind: 'group' }]],
    ] as const)('disables child action for %s selected in the editor', (_case, editorSelection) => {
        const data = architectureDiagram();
        const stub = new ViewServiceStub(['root-1'], data);
        const session = createEditSession(rootRecord, data);
        const { selection } = renderBar(stub, session);

        act(() => selection.replace(editorSelection));

        expect(screen.getByRole('button', { name: 'Add child diagram' })).toBeDisabled();
    });

    it('disables child action for a newly added editor item missing from Current', () => {
        const data = architectureDiagram();
        const stub = new ViewServiceStub(['root-1'], data);
        const editorData = {
            ...data,
            nodes: [...data.nodes, { id: 'new-node', label: 'New node', legendEntryId: 'focal', role: 'focal' as const }],
        };
        const session = createEditSession(rootRecord, editorData);
        const { selection } = renderBar(stub, session);

        act(() => selection.replace([{ objectId: 'new-node', objectKind: 'node' }]));

        expect(screen.getByRole('button', { name: 'Add child diagram' })).toBeDisabled();
    });
});

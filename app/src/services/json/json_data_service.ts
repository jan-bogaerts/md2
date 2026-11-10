import type { ProjectWatchEvent } from '../../data/data_types';
import { dataService, type DataService } from '../data/data_service';
import { dialogService, type DialogService } from '../dialog_service';
import type { OpenDocumentEventDetail } from '../open_files_service';
import { openFilesService, type OpenFilesService } from '../open_files_service';
import { projectAccessService, type ProjectAccessService } from '../project/project_access_service';
import { register } from '../service_injector';
import { JsonDataDocument } from './json_data_document';
import type { JsonValue } from './json_types';

type JsonDataOwner = EventTarget & Pick<DataService, 'getState' | 'loadRepositoryTextFile'>;
type JsonOpenFilesOwner = EventTarget & Pick<OpenFilesService, 'discardDocument'>;

export interface JsonDataServiceDependencies {
    dataOwner: JsonDataOwner;
    dialogs: Pick<DialogService, 'warning'>;
    openFilesOwner: JsonOpenFilesOwner;
    projectAccess: Pick<ProjectAccessService, 'getSnapshot'>;
}

function projectKey(service: JsonDataOwner) {
    const project = service.getState().project;

    return project ? `${project.id}:${project.branch}` : null;
}

function parseJson(path: string, content: string) {
    try {
        return JSON.parse(content) as JsonValue;
    } catch (error) {
        throw new Error(`Invalid JSON in ${path}`, { cause: error });
    }
}

/** Loads and owns one JSON document per active-project path. */
export class JsonDataService extends EventTarget {
    private dependencies: JsonDataServiceDependencies | null = null;
    private readonly documents = new Map<string, JsonDataDocument>();
    private loadedProjectKey: string | null = null;
    private readonly pendingLoads = new Map<string, Promise<JsonDataDocument>>();
    private readonly reloadRevisions = new Map<string, number>();

    constructor() {
        super();
        register('jsonDataService', this);
    }

    init(dependencies: JsonDataServiceDependencies) {
        if (
            this.dependencies?.dataOwner === dependencies.dataOwner
            && this.dependencies.dialogs === dependencies.dialogs
            && this.dependencies.openFilesOwner === dependencies.openFilesOwner
            && this.dependencies.projectAccess === dependencies.projectAccess
        ) return;

        this.removeDependencyListeners();
        this.dependencies = dependencies;
        this.loadedProjectKey = projectKey(dependencies.dataOwner);
        this.documents.clear();
        this.pendingLoads.clear();
        this.reloadRevisions.clear();
        dependencies.dataOwner.addEventListener('changed', this.handleProjectChanged);
        dependencies.dataOwner.addEventListener('repositoryChanged', this.handleRepositoryChanged);
        dependencies.openFilesOwner.addEventListener('removed', this.handleOpenDocumentRemoved);
    }

    async open(path: string) {
        const { dataOwner } = this.requireDependencies();
        const state = dataOwner.getState();
        if (!state.project) throw new Error('Cannot open JSON without an active project');

        const existing = this.documents.get(path);
        const fileExists = !!state.snapshot?.repositoryFiles.includes(path);
        if (!fileExists && !existing?.dirty) throw new Error(`JSON file does not exist in active project: ${path}`);
        if (existing) return existing;

        const pendingLoad = this.pendingLoads.get(path);
        if (pendingLoad) return pendingLoad;

        const expectedProjectKey = projectKey(dataOwner);
        const load = this.loadDocument(path, expectedProjectKey);
        this.pendingLoads.set(path, load);
        try {
            return await load;
        } finally {
            if (this.pendingLoads.get(path) === load) this.pendingLoads.delete(path);
        }
    }

    find(path: string) {
        return this.documents.get(path) ?? null;
    }

    close(document: JsonDataDocument) {
        if (this.documents.get(document.path) !== document) return;

        this.documents.delete(document.path);
        this.reloadRevisions.delete(document.path);
        this.dispatchEvent(new CustomEvent('closed', { detail: { document } }));
    }

    private async loadDocument(path: string, expectedProjectKey: string | null) {
        const { dataOwner, projectAccess } = this.requireDependencies();
        const file = await dataOwner.loadRepositoryTextFile(path);
        const state = dataOwner.getState();
        if (projectKey(dataOwner) !== expectedProjectKey || this.loadedProjectKey !== expectedProjectKey) {
            throw new Error(`Active project changed while loading JSON: ${path}`);
        }
        if (!state.snapshot?.repositoryFiles.includes(path)) {
            throw new Error(`JSON file does not exist in active project: ${path}`);
        }

        const existing = this.documents.get(path);
        if (existing) return existing;

        const document = new JsonDataDocument(path, parseJson(path, file.content), projectAccess.getSnapshot());
        this.documents.set(path, document);
        this.dispatchEvent(new CustomEvent('opened', { detail: { document } }));

        return document;
    }

    private readonly handleProjectChanged = () => {
        const { dataOwner } = this.requireDependencies();
        const nextProjectKey = projectKey(dataOwner);
        if (nextProjectKey === this.loadedProjectKey) return;

        this.loadedProjectKey = nextProjectKey;
        this.documents.clear();
        this.pendingLoads.clear();
        this.reloadRevisions.clear();
        this.dispatchEvent(new Event('cleared'));
    };

    private readonly handleOpenDocumentRemoved = (event: Event) => {
        const { document } = (event as CustomEvent<OpenDocumentEventDetail>).detail;
        if (document.kind === 'json') this.close(document);
    };

    private readonly handleRepositoryChanged = (event: Event) => {
        const { changeKind, path } = (event as CustomEvent<ProjectWatchEvent>).detail;
        const document = this.documents.get(path);
        if (!document) return;

        const reloadRevision = (this.reloadRevisions.get(path) ?? 0) + 1;
        this.reloadRevisions.set(path, reloadRevision);
        if (document.dirty) {
            this.warnExternalConflict(document);
            return;
        }
        if (changeKind === 'removed') {
            this.invalidateDocument(document, `JSON file was removed outside the editor: ${path}`, 'JSON file removed');
            return;
        }

        void this.reload(document, reloadRevision, this.loadedProjectKey);
    };

    private async reload(document: JsonDataDocument, reloadRevision: number, expectedProjectKey: string | null) {
        const { dataOwner } = this.requireDependencies();
        try {
            const file = await dataOwner.loadRepositoryTextFile(document.path);
            if (!this.isCurrentReload(document, reloadRevision, expectedProjectKey)) return;
            if (document.dirty) {
                this.warnExternalConflict(document);
                return;
            }
            document.replaceFromExternal(parseJson(document.path, file.content));
        } catch (error) {
            if (!this.isCurrentReload(document, reloadRevision, expectedProjectKey)) return;
            if (document.dirty) {
                this.warnExternalConflict(document);
                return;
            }

            const message = error instanceof Error ? error.message : `JSON file could not be reloaded: ${document.path}`;
            this.invalidateDocument(document, message, 'JSON reload failed');
        }
    }

    private isCurrentReload(document: JsonDataDocument, reloadRevision: number, expectedProjectKey: string | null) {
        const { dataOwner } = this.requireDependencies();

        return this.documents.get(document.path) === document
            && this.reloadRevisions.get(document.path) === reloadRevision
            && this.loadedProjectKey === expectedProjectKey
            && projectKey(dataOwner) === expectedProjectKey;
    }

    private invalidateDocument(document: JsonDataDocument, message: string, title: string) {
        if (this.documents.get(document.path) !== document) return;

        document.invalidate(message);
        this.documents.delete(document.path);
        this.reloadRevisions.delete(document.path);
        this.dependencies?.openFilesOwner.discardDocument(document);
        this.dependencies?.dialogs.warning(message, { title });
        this.dispatchEvent(new CustomEvent('invalidated', { detail: { document } }));
    }

    private warnExternalConflict(document: JsonDataDocument) {
        if (!document.markExternalConflict()) return;

        this.dependencies?.dialogs.warning(
            `JSON file changed outside the editor. Local draft was kept: ${document.path}`,
            { title: 'JSON file changed externally' },
        );
    }

    private removeDependencyListeners() {
        if (!this.dependencies) return;

        this.dependencies.dataOwner.removeEventListener('changed', this.handleProjectChanged);
        this.dependencies.dataOwner.removeEventListener('repositoryChanged', this.handleRepositoryChanged);
        this.dependencies.openFilesOwner.removeEventListener('removed', this.handleOpenDocumentRemoved);
    }

    private requireDependencies() {
        if (!this.dependencies) throw new Error('JSON data service is not initialized');

        return this.dependencies;
    }
}

export const jsonDataService = new JsonDataService();

export function initDefaultJsonDataService() {
    jsonDataService.init({
        dataOwner: dataService,
        dialogs: dialogService,
        openFilesOwner: openFilesService,
        projectAccess: projectAccessService,
    });
}

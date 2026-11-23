import { dialogService } from '../../../services/dialog_service';
import type {
    DiffWorkspaceEntry,
    DiffWorkspaceFileContent,
    DiffWorkspaceFileState,
    DiffWorkspaceManifestState,
    DiffWorkspaceSource,
} from './diff_workspace_types';

const ACTIVE_PATH_CHANGED_EVENT = 'active-path-changed';
const MANIFEST_CHANGED_EVENT = 'manifest-changed';
const OPEN_PATHS_CHANGED_EVENT = 'open-paths-changed';
const FILE_CHANGED_EVENT_PREFIX = 'file-changed:';
const LOADING_MANIFEST: DiffWorkspaceManifestState = { status: 'loading' };
const LOADING_FILE: DiffWorkspaceFileState = { status: 'loading' };
const EMPTY_FILE: DiffWorkspaceFileState = { status: 'empty' };
const NO_OPEN_PATHS: readonly string[] = [];

function fileChangedEvent(path: string) {
    return `${FILE_CHANGED_EVENT_PREFIX}${path}`;
}

function asError(error: unknown, fallbackMessage: string) {
    return error instanceof Error ? error : new Error(fallbackMessage);
}

function isEmptyContent(content: DiffWorkspaceFileContent) {
    return content.kind === 'patch' && content.result.patch.trim().length === 0;
}

/** Owns one diff workspace: changed-file manifest, open tabs, active tab, and per-path lazy file results. */
export class DiffWorkspaceService extends EventTarget {
    private activePath: string | null = null;
    private fileStates = new Map<string, DiffWorkspaceFileState>();
    private manifest: DiffWorkspaceManifestState = LOADING_MANIFEST;
    private openPaths: readonly string[] = NO_OPEN_PATHS;
    private source: DiffWorkspaceSource | null = null;

    /** Active file tab path; `null` means the `Files` tab. */
    readonly getActivePath = () => this.activePath;
    readonly getManifest = () => this.manifest;
    readonly getOpenPaths = () => this.openPaths;

    readonly subscribeActivePath = this.subscribe(ACTIVE_PATH_CHANGED_EVENT);
    readonly subscribeManifest = this.subscribe(MANIFEST_CHANGED_EVENT);
    readonly subscribeOpenPaths = this.subscribe(OPEN_PATHS_CHANGED_EVENT);

    getFileState(path: string): DiffWorkspaceFileState {
        return this.fileStates.get(path) ?? LOADING_FILE;
    }

    subscribeFile(path: string) {
        return this.subscribe(fileChangedEvent(path));
    }

    /** Switch to another diff source. The same key keeps the current workspace; a new key resets and loads its manifest. */
    setSource(source: DiffWorkspaceSource) {
        if (this.source?.key === source.key) return;

        this.reset();
        this.source = source;
        void this.loadManifest(source);
    }

    /** Drop source, tabs, and cached results; pending responses of the dropped source are ignored. */
    reset() {
        const cachedPaths = [...this.fileStates.keys()];
        const hadOpenPaths = this.openPaths.length > 0;
        this.source = null;
        this.fileStates = new Map();
        this.setManifest(LOADING_MANIFEST);
        this.openPaths = NO_OPEN_PATHS;
        if (hadOpenPaths) this.publish(OPEN_PATHS_CHANGED_EVENT);
        this.setActivePath(null);
        for (const path of cachedPaths) this.publish(fileChangedEvent(path));
    }

    showFiles() {
        this.setActivePath(null);
    }

    /** Open (or reuse) the tab of one manifest path, activate it, and load it once unless already loading or loaded. */
    openFile(path: string) {
        const entry = this.findEntry(path);
        if (!entry || !this.source) return;

        if (!this.openPaths.includes(path)) {
            this.openPaths = [...this.openPaths, path];
            this.publish(OPEN_PATHS_CHANGED_EVENT);
        }
        this.setActivePath(path);
        const currentState = this.fileStates.get(path);
        if (currentState && currentState.status !== 'error') return;

        void this.loadFile(this.source, entry);
    }

    private findEntry(path: string) {
        if (this.manifest.status !== 'ready') return null;

        return this.manifest.entries.find((entry) => entry.path === path) ?? null;
    }

    private async loadManifest(source: DiffWorkspaceSource) {
        try {
            const entries = await source.loadManifest();
            if (this.source !== source) return;

            this.setManifest({ entries, status: 'ready' });
        } catch (loadError) {
            if (this.source !== source) return;

            const error = asError(loadError, 'Could not load changed files');
            this.setManifest({ error, status: 'error' });
            dialogService.error(error, { fallbackMessage: 'Could not load changed files' });
        }
    }

    private async loadFile(source: DiffWorkspaceSource, entry: DiffWorkspaceEntry) {
        this.setFileState(entry.path, LOADING_FILE);
        try {
            const content = await source.loadFile(entry);
            if (this.source !== source) return;

            this.setFileState(entry.path, isEmptyContent(content) ? EMPTY_FILE : { content, status: 'ready' });
        } catch (loadError) {
            if (this.source !== source) return;

            const error = asError(loadError, `Could not load diff for ${entry.path}`);
            this.setFileState(entry.path, { error, status: 'error' });
            dialogService.error(error, { fallbackMessage: `Could not load diff for ${entry.path}` });
        }
    }

    private setActivePath(path: string | null) {
        if (this.activePath === path) return;

        this.activePath = path;
        this.publish(ACTIVE_PATH_CHANGED_EVENT);
    }

    private setManifest(manifest: DiffWorkspaceManifestState) {
        if (this.manifest === manifest) return;

        this.manifest = manifest;
        this.publish(MANIFEST_CHANGED_EVENT);
    }

    private setFileState(path: string, state: DiffWorkspaceFileState) {
        this.fileStates.set(path, state);
        this.publish(fileChangedEvent(path));
    }

    private subscribe(eventType: string) {
        return (listener: () => void) => {
            this.addEventListener(eventType, listener);

            return () => this.removeEventListener(eventType, listener);
        };
    }

    private publish(eventType: string) {
        this.dispatchEvent(new Event(eventType));
    }
}

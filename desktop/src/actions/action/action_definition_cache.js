const {
    BUILTIN_CUSTOM_PROMPT,
    BUILTIN_REMARKABLE_CONVERT,
} = require('../../../../shared/action_definitions.mjs');
const { loadTolerantActionDefinitionGraph } = require('../../../../shared/tolerant_action_definitions.mjs');

const BUILTIN_ACTION_IDS = new Set([BUILTIN_CUSTOM_PROMPT.id, BUILTIN_REMARKABLE_CONVERT.id]);

class ActionPathRefreshRequired extends Error {}

function defaultActionId(actionPath) {
    const pathIdentity = actionPath.replace(/\.json$/iu, '').replace(/[^A-Za-z0-9]+/gu, '-').replace(/^-|-$/gu, '').toLowerCase();

    return `action-${pathIdentity || 'unnamed'}`;
}

function actionIdFromFile(file) {
    let definition;
    try {
        definition = JSON.parse(file.content);
    } catch {
        return null;
    }
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return null;
    if (definition.id === undefined) return defaultActionId(file.path);
    if (typeof definition.id !== 'string' || definition.id.length === 0) return null;

    return definition.id;
}

function referencedActionIds(content) {
    let definition;
    try {
        definition = JSON.parse(content);
    } catch {
        return [];
    }
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return [];

    const ids = [];
    if (Array.isArray(definition.onBefore)) ids.push(...definition.onBefore.filter((id) => typeof id === 'string'));
    if (Array.isArray(definition.onAfter)) ids.push(...definition.onAfter.filter((id) => typeof id === 'string'));
    if (Array.isArray(definition.on)) {
        ids.push(...definition.on
            .map((rule) => rule?.actionId)
            .filter((id) => typeof id === 'string'));
    }

    return ids;
}

function buildActionPaths(files) {
    const actionPaths = new Map();
    for (const file of files) {
        const actionId = actionIdFromFile(file);
        if (actionId && !BUILTIN_ACTION_IDS.has(actionId) && !actionPaths.has(actionId)) actionPaths.set(actionId, file.path);
    }

    return actionPaths;
}

class ActionDefinitionCache {
    constructor(dependencies) {
        this.localGitService = dependencies?.localGitService;
        this.actionPaths = new Map();
        this.actionsFolder = null;
        this.project = null;
        this.refreshPromise = null;
        this.version = 0;
    }

    /** Index action ids and paths for one project without retaining file contents. */
    async startProject(project, actionsFolder) {
        if (!this.localGitService) throw new Error('Action definition cache has no local Git service');
        const version = ++this.version;
        this.refreshPromise = null;
        const files = await this.localGitService.loadActionFiles(project, actionsFolder);
        if (version !== this.version) return;

        this.actionPaths = buildActionPaths(files);
        this.actionsFolder = actionsFolder;
        this.project = { ...project };
    }

    stop() {
        this.version += 1;
        this.actionPaths.clear();
        this.actionsFolder = null;
        this.project = null;
        this.refreshPromise = null;
    }

    /** Resolve one current definition, reading only it and its linked definitions from disk. */
    async resolve(actionId, profiles, states) {
        if (!this.project || this.actionsFolder === null) throw new Error('Action definition cache has no project');

        try {
            return await this.resolveCurrent(actionId, profiles, states, true);
        } catch (error) {
            if (!(error instanceof ActionPathRefreshRequired) && error?.code !== 'ENOENT') throw error;
        }

        await this.refreshActionPaths();

        return this.resolveCurrent(actionId, profiles, states, false);
    }

    async resolveCurrent(actionId, profiles, states, refreshMissingPaths) {
        const files = await this.loadDefinitionFiles(actionId, refreshMissingPaths);
        const { actions, issues } = loadTolerantActionDefinitionGraph(files, { profiles, states });
        const action = actions.find((candidate) => candidate.id === actionId);
        if (!action) {
            const issueDetails = issues.length > 0 ? `. ${issues.map(({ message }) => message).join(' ')}` : '';
            throw new Error(`Unknown action: ${actionId}${issueDetails}`);
        }

        return action;
    }

    async refreshActionPaths() {
        if (this.refreshPromise) return this.refreshPromise;

        const version = this.version;
        const project = { ...this.project };
        const actionsFolder = this.actionsFolder;
        const refreshPromise = this.loadCurrentActionPaths(project, actionsFolder, version);
        this.refreshPromise = refreshPromise;
        try {
            await refreshPromise;
        } finally {
            if (this.refreshPromise === refreshPromise) this.refreshPromise = null;
        }
    }

    async loadCurrentActionPaths(project, actionsFolder, version) {
        const files = await this.localGitService.loadActionFiles(project, actionsFolder);
        const actionPaths = buildActionPaths(files);
        if (version !== this.version) return;

        this.actionPaths = actionPaths;
    }

    async loadDefinitionFiles(actionId, refreshMissingPaths) {
        const pendingIds = [actionId];
        const visitedIds = new Set();
        const filesByPath = new Map();

        while (pendingIds.length > 0) {
            const currentId = pendingIds.shift();
            if (visitedIds.has(currentId) || BUILTIN_ACTION_IDS.has(currentId)) continue;
            visitedIds.add(currentId);

            const actionPath = this.actionPaths.get(currentId);
            if (!actionPath) {
                if (refreshMissingPaths) throw new ActionPathRefreshRequired();
                continue;
            }
            if (filesByPath.has(actionPath)) continue;

            const file = await this.localGitService.loadActionFile(this.project, actionPath);
            filesByPath.set(actionPath, file);
            pendingIds.push(...referencedActionIds(file.content));
        }

        return [...filesByPath.values()];
    }
}

module.exports = { ActionDefinitionCache };

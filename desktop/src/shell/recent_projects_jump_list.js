const path = require('node:path');

// Must match builder `APP_ID` in packaging/builder_config.js; Windows links the Jump List to the pinned icon by this id.
const APP_USER_MODEL_ID = 'io.md2.desktop';
const RECENT_LOCAL_REPOSITORIES_KEY = 'md2.recentLocalRepositories';
const RECENT_PROJECTS_CATEGORY_NAME = 'Recent projects';
const JUMP_LIST_OK_RESULT = 'ok';
const EXECUTABLE_ICON_INDEX = 0;

/** Parse the stored recent-folder list; invalid values are reported and treated as empty. */
function readRecentRootPaths(applicationStateStore, errorReporter) {
    const storedValue = applicationStateStore.get(RECENT_LOCAL_REPOSITORIES_KEY, null);
    if (storedValue === null) return [];

    try {
        const rootPaths = JSON.parse(storedValue);
        if (!Array.isArray(rootPaths)) throw new Error('Recent local repositories must be an array');

        return rootPaths.filter((rootPath) => typeof rootPath === 'string' && rootPath.length > 0);
    } catch (error) {
        errorReporter(error);

        return [];
    }
}

/** Build one Jump List task that starts MD² with the given project folder. */
function createRecentProjectTask(rootPath) {
    const title = path.basename(rootPath) || rootPath;

    return {
        type: 'task',
        title,
        description: rootPath,
        program: process.execPath,
        args: `"${rootPath}"`,
        iconPath: process.execPath,
        iconIndex: EXECUTABLE_ICON_INDEX,
    };
}

/** Replace the Jump List with the stored recent local project folders. */
function applyRecentProjectsJumpList(app, applicationStateStore, errorReporter) {
    const rootPaths = readRecentRootPaths(applicationStateStore, errorReporter);
    const categories = rootPaths.length > 0
        ? [{ type: 'custom', name: RECENT_PROJECTS_CATEGORY_NAME, items: rootPaths.map(createRecentProjectTask) }]
        : null;
    const result = app.setJumpList(categories);
    if (result !== JUMP_LIST_OK_RESULT) errorReporter(new Error(`Jump List update failed: ${result}`));
}

/** Keep the Windows taskbar Jump List in sync with recent local projects (packaged Windows builds only). */
function registerRecentProjectsJumpList({ app, applicationStateStore, errorReporter }) {
    if (!app.isPackaged || process.platform !== 'win32') return;

    app.setAppUserModelId(APP_USER_MODEL_ID);
    applyRecentProjectsJumpList(app, applicationStateStore, errorReporter);
    applicationStateStore.onDidChange(
        RECENT_LOCAL_REPOSITORIES_KEY,
        () => applyRecentProjectsJumpList(app, applicationStateStore, errorReporter),
    );
}

module.exports = { APP_USER_MODEL_ID, registerRecentProjectsJumpList };

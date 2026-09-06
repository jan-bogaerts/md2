const {
    DEFAULT_ACTIONS_FOLDER,
    DEFAULT_DIAGRAMS_FOLDER,
    DEFAULT_DIAGRAM_FOOTER,
    DEFAULT_PROJECT_FOLDER,
    DEFAULT_RELEASES_FOLDER,
    DEFAULT_WORKING_FOLDER,
    joinProjectFolderPath,
} = require('../../../shared/project_config_defaults.mjs');

// Pure resolution of an already-loaded project config: the caller owns reading `.md2/config`,
// so the file is read once per activation and every service is handed the same resolved paths.
function resolveProjectPaths(config) {
    const projectFolder = typeof config?.projectFolder === 'string' ? config.projectFolder : DEFAULT_PROJECT_FOLDER;
    const configuredReleasesFolder = config?.releasesFolder ?? DEFAULT_RELEASES_FOLDER;
    if (typeof configuredReleasesFolder !== 'string' || configuredReleasesFolder.length === 0) {
        throw new Error('Invalid project releasesFolder');
    }
    const releasesFolder = joinProjectFolderPath(projectFolder, configuredReleasesFolder);
    const configuredDiagramsFolder = config?.diagramsFolder ?? DEFAULT_DIAGRAMS_FOLDER;
    if (typeof configuredDiagramsFolder !== 'string' || configuredDiagramsFolder.length === 0) {
        throw new Error('Invalid project diagramsFolder');
    }
    const diagramsFolder = joinProjectFolderPath(projectFolder, configuredDiagramsFolder);
    const diagramFooter = config?.diagramFooter ?? DEFAULT_DIAGRAM_FOOTER;
    if (typeof diagramFooter !== 'string' || diagramFooter.length === 0 || !diagramFooter.includes('{{diagram-file}}')) {
        throw new Error('Invalid project diagramFooter: requires {{diagram-file}} placeholder');
    }
    const configuredWorkingFolder = config?.workingFolder ?? DEFAULT_WORKING_FOLDER;
    if (typeof configuredWorkingFolder !== 'string' || configuredWorkingFolder.length === 0) {
        throw new Error('Invalid project workingFolder');
    }
    const activeCardsFolder = joinProjectFolderPath(projectFolder, configuredWorkingFolder);
    let configuredActionsFolder = DEFAULT_ACTIONS_FOLDER;
    if (config?.actionsFolder !== undefined) {
        if (typeof config.actionsFolder !== 'string' || config.actionsFolder.length === 0) {
            throw new Error('Invalid project actionsFolder');
        }
        configuredActionsFolder = config.actionsFolder;
    }

    return {
        actionsFolder: joinProjectFolderPath(projectFolder, configuredActionsFolder),
        activeCardsFolder,
        diagramFooter,
        diagramsFolder,
        projectFolder,
        releasesFolder,
    };
}

module.exports = { resolveProjectPaths };

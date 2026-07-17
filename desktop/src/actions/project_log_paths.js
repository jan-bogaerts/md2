const path = require('node:path');

const {
    conversationLogFileName,
    historyLogFileName,
    projectLogFolder,
} = require('../../../shared/log_paths.mjs');
const { ensureInsideRoot } = require('../git/git_commands');

function projectLogFolderPath(rootPath, projectFolder) {
    return ensureInsideRoot(rootPath, path.join(rootPath, projectLogFolder(projectFolder)));
}

function conversationLogFilePath(rootPath, projectFolder, scopePath, conversationId) {
    const folderPath = projectLogFolderPath(rootPath, projectFolder);
    const fileName = conversationLogFileName(scopePath, conversationId, projectFolder);

    return ensureInsideRoot(rootPath, path.join(folderPath, fileName));
}

function actionHistoryFilePath(rootPath, projectFolder, actionId, context) {
    const folderPath = projectLogFolderPath(rootPath, projectFolder);
    const fileName = historyLogFileName(context, actionId, projectFolder);

    return ensureInsideRoot(rootPath, path.join(folderPath, fileName));
}

module.exports = { actionHistoryFilePath, conversationLogFilePath, projectLogFolderPath };

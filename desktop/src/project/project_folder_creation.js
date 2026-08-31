const fs = require('node:fs');
const path = require('node:path');

const { ensureInsideRoot, pathExists } = require('../git/git_commands');

const PROJECT_README_TEMPLATE = '# MD²\n\nProject design folder created by MD².\n';

/** Creates missing project folders with Git placeholder files and leaves existing folders untouched. */
async function createMissingProjectFolders(rootPath, folders) {
    if (!Array.isArray(folders)) throw new Error('Project folders must be an array');

    const createdFolders = [];
    for (const folder of new Set(folders)) {
        if (typeof folder !== 'string' || folder.length === 0) throw new Error('Project folder path is required');

        const folderPath = ensureInsideRoot(rootPath, path.join(rootPath, folder));
        if (await pathExists(folderPath)) continue;

        await fs.promises.mkdir(folderPath, { recursive: true });
        await fs.promises.writeFile(path.join(folderPath, 'README.md'), PROJECT_README_TEMPLATE);
        createdFolders.push(folder);
    }

    return createdFolders;
}

module.exports = { createMissingProjectFolders, PROJECT_README_TEMPLATE };

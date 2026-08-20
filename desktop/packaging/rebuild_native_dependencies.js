const fs = require('node:fs');
const path = require('node:path');

const NODE_PTY_MODULE_NAME = 'node-pty';
const ELECTRON_REBUILD_METADATA_FILE = '.forge-meta';
const WINDOWS_NODE_PTY_PREBUILD_FILES = [
    'conpty.node',
    'conpty_console_list.node',
    'pty.node',
    'winpty-agent.exe',
    'winpty.dll',
];

function assertNodePtyPrebuildExists(appDirectory, platform, architecture) {
    if (platform !== 'win32') return;

    const prebuildDirectory = path.join(
        appDirectory,
        'node_modules',
        NODE_PTY_MODULE_NAME,
        'prebuilds',
        `${platform}-${architecture}`,
    );
    const missingFiles = WINDOWS_NODE_PTY_PREBUILD_FILES
        .filter((fileName) => !fs.existsSync(path.join(prebuildDirectory, fileName)));

    if (missingFiles.length === 0) return;

    throw new Error(
        `Cannot package ${NODE_PTY_MODULE_NAME}: missing ${platform}-${architecture} prebuild files: `
        + missingFiles.join(', '),
    );
}

function getNodePtyRebuildMetadataPath(appDirectory) {
    return path.join(
        appDirectory,
        'node_modules',
        NODE_PTY_MODULE_NAME,
        'build',
        'Release',
        ELECTRON_REBUILD_METADATA_FILE,
    );
}

/** Retains node-pty's N-API prebuild while electron-builder rebuilds other native dependencies. */
async function rebuildNativeDependencies(context, getAbiImplementation) {
    const { appDir, electronVersion, platform, arch } = context;
    assertNodePtyPrebuildExists(appDir, platform, arch);

    const getAbi = getAbiImplementation ?? (await import('node-abi')).getAbi;
    const metadataPath = getNodePtyRebuildMetadataPath(appDir);
    const metadata = `${arch}--${getAbi(electronVersion, 'electron')}`;
    fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
    fs.writeFileSync(metadataPath, metadata);

    return true;
}

module.exports = {
    NODE_PTY_MODULE_NAME,
    WINDOWS_NODE_PTY_PREBUILD_FILES,
    assertNodePtyPrebuildExists,
    getNodePtyRebuildMetadataPath,
    rebuildNativeDependencies,
};

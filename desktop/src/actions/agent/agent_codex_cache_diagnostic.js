const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crossSpawn = require('cross-spawn');
const { terminateProcessTree } = require('../process_tree');

const CODEX_CACHE_ERROR_PATTERN = /failed to (?:load models cache|renew cache TTL):/iu;
const CODEX_VERSION_PATTERN = /codex-cli\s+(\d+\.\d+\.\d+(?:-[^\s]+)?)/iu;
const VERSION_CHECK_TIMEOUT_MS = 5000;

function environmentValue(environment, name) {
    const matchingName = Object.keys(environment).find((currentName) => currentName.toLowerCase() === name.toLowerCase());

    return matchingName ? environment[matchingName] : undefined;
}

function codexHome(environment, homeDirectory) {
    const configuredHome = environmentValue(environment, 'CODEX_HOME');

    return configuredHome ? path.resolve(configuredHome) : path.join(homeDirectory, '.codex');
}

function coreVersion(version) {
    return typeof version === 'string' ? version.match(/^\d+\.\d+\.\d+/u)?.[0] ?? null : null;
}

function codexVersionsMatch(runningVersion, cacheVersion) {
    const runningCoreVersion = coreVersion(runningVersion);
    const cacheCoreVersion = coreVersion(cacheVersion);

    return !!runningCoreVersion && runningCoreVersion === cacheCoreVersion;
}

function parseCodexVersion(output) {
    return output.match(CODEX_VERSION_PATTERN)?.[1] ?? null;
}

function readCodexVersion(executable, environment, spawn = crossSpawn) {
    return new Promise((resolve) => {
        const child = spawn(executable, ['--version'], {
            detached: process.platform !== 'win32',
            env: environment,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        let output = '';
        const timeout = setTimeout(async () => {
            await terminateProcessTree(child);
            resolve(null);
        }, VERSION_CHECK_TIMEOUT_MS);
        child.stdout.on('data', (chunk) => {
            output += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            output += chunk.toString();
        });
        child.on('error', () => {
            clearTimeout(timeout);
            resolve(null);
        });
        child.on('close', () => {
            clearTimeout(timeout);
            resolve(parseCodexVersion(output));
        });
    });
}

async function readCacheVersion(environment, dependencies) {
    const homeDirectory = dependencies.homeDirectory ?? os.homedir();
    const cachePath = path.join(codexHome(environment, homeDirectory), 'models_cache.json');
    try {
        const content = await dependencies.readFile(cachePath, 'utf8');
        const cache = JSON.parse(content);

        return typeof cache.client_version === 'string' ? cache.client_version : null;
    } catch {
        return null;
    }
}

function cacheDiagnosticMessage(errorLine, runningVersion, cacheVersion) {
    const slowdownMessage = 'Codex model-cache failures can significantly slow down agent tool calls.';
    if (runningVersion && cacheVersion && !codexVersionsMatch(runningVersion, cacheVersion)) {
        return [
            'Codex model cache is incompatible with the running CLI.',
            `Running Codex version: ${runningVersion}. Cache client version: ${cacheVersion}.`,
            'Update Codex with `npm install --global @openai/codex@latest`, then restart MD2.',
            slowdownMessage,
        ].join('\n');
    }

    const versionMessage = runningVersion && cacheVersion
        ? `Running Codex version ${runningVersion} matches cache client version ${cacheVersion}.`
        : 'MD2 could not determine both the running Codex and cache client versions.';

    return `${errorLine.trim()}\n${versionMessage}\n${slowdownMessage}`;
}

/** Diagnose a Codex model-cache error and return one actionable user-facing message. */
async function diagnoseCodexCacheError(errorLine, executable, environment, dependencies = {}) {
    const configuredDependencies = {
        homeDirectory: dependencies.homeDirectory,
        readFile: dependencies.readFile ?? fs.promises.readFile,
        spawn: dependencies.spawn ?? crossSpawn,
    };
    const [runningVersion, cacheVersion] = await Promise.all([
        readCodexVersion(executable, environment, configuredDependencies.spawn),
        readCacheVersion(environment, configuredDependencies),
    ]);

    return cacheDiagnosticMessage(errorLine, runningVersion, cacheVersion);
}

function isCodexCacheError(content) {
    return CODEX_CACHE_ERROR_PATTERN.test(content);
}

module.exports = {
    cacheDiagnosticMessage,
    codexVersionsMatch,
    diagnoseCodexCacheError,
    isCodexCacheError,
    parseCodexVersion,
};

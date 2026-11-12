const fs = require('node:fs/promises');
const path = require('node:path');

const RENDERER_ASSETS_DIRECTORY = path.resolve(__dirname, '..', '..', 'app', 'dist', 'assets');
const JAVASCRIPT_EXTENSION = '.js';
const SOURCE_MAP_SUFFIX = '.map';
const SENTRY_DEBUG_ID_PATTERN = /sentry-dbid-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;

/**
 * Confirms that every emitted renderer bundle carries a Sentry debug ID and has a source map,
 * so the uploaded artifacts can symbolicate production renderer errors.
 */
async function verifyRendererSourceMaps(assetsDirectory = RENDERER_ASSETS_DIRECTORY) {
    const fileNames = await fs.readdir(assetsDirectory);
    const bundleNames = fileNames.filter((fileName) => path.extname(fileName) === JAVASCRIPT_EXTENSION);
    if (bundleNames.length === 0) throw new Error(`No renderer bundles found in ${assetsDirectory}`);

    const fileNameSet = new Set(fileNames);
    const bundlesWithoutSourceMap = bundleNames.filter((bundleName) => !fileNameSet.has(`${bundleName}${SOURCE_MAP_SUFFIX}`));
    if (bundlesWithoutSourceMap.length > 0) {
        throw new Error(`Renderer bundles without source maps: ${bundlesWithoutSourceMap.join(', ')}`);
    }

    const bundlesWithoutDebugId = [];
    for (const bundleName of bundleNames) {
        const bundleSource = await fs.readFile(path.join(assetsDirectory, bundleName), 'utf8');
        if (!SENTRY_DEBUG_ID_PATTERN.test(bundleSource)) bundlesWithoutDebugId.push(bundleName);
    }
    if (bundlesWithoutDebugId.length > 0) {
        throw new Error(`Renderer bundles without Sentry debug IDs: ${bundlesWithoutDebugId.join(', ')}`);
    }
}

module.exports = { RENDERER_ASSETS_DIRECTORY, verifyRendererSourceMaps };

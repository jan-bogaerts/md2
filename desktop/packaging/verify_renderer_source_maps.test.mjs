import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { verifyRendererSourceMaps } = require('./verify_renderer_source_maps');

const STAMPED_BUNDLE = 'e._sentryDebugIdIdentifier="sentry-dbid-0f8a2c4e-1b3d-4e5f-8a7b-9c0d1e2f3a4b";console.log(1);';
const UNSTAMPED_BUNDLE = 'console.log(1);';
const SOURCE_MAP = '{"version":3,"sources":[],"mappings":""}';

async function writeAsset(directory, fileName, content) {
    await writeFile(path.join(directory, fileName), content, 'utf8');
}

describe('renderer source-map verification', () => {
    let assetsDirectory;

    beforeEach(async () => {
        assetsDirectory = await mkdtemp(path.join(os.tmpdir(), 'md2-renderer-assets-'));
    });

    afterEach(async () => {
        await rm(assetsDirectory, { force: true, recursive: true });
    });

    it('accepts bundles that carry a Sentry debug ID and have a source map', async () => {
        await writeAsset(assetsDirectory, 'index-a.js', STAMPED_BUNDLE);
        await writeAsset(assetsDirectory, 'index-a.js.map', SOURCE_MAP);
        await writeAsset(assetsDirectory, 'index-a.css', 'body{}');

        await expect(verifyRendererSourceMaps(assetsDirectory)).resolves.toBeUndefined();
    });

    it('rejects bundles without a generated source map', async () => {
        await writeAsset(assetsDirectory, 'index-a.js', STAMPED_BUNDLE);

        await expect(verifyRendererSourceMaps(assetsDirectory)).rejects
            .toThrow('Renderer bundles without source maps: index-a.js');
    });

    it('rejects bundles without a Sentry debug ID', async () => {
        await writeAsset(assetsDirectory, 'index-a.js', STAMPED_BUNDLE);
        await writeAsset(assetsDirectory, 'index-a.js.map', SOURCE_MAP);
        await writeAsset(assetsDirectory, 'worker-b.js', UNSTAMPED_BUNDLE);
        await writeAsset(assetsDirectory, 'worker-b.js.map', SOURCE_MAP);

        await expect(verifyRendererSourceMaps(assetsDirectory)).rejects
            .toThrow('Renderer bundles without Sentry debug IDs: worker-b.js');
    });

    it('rejects an output without renderer bundles', async () => {
        await expect(verifyRendererSourceMaps(assetsDirectory)).rejects.toThrow('No renderer bundles found');
    });
});

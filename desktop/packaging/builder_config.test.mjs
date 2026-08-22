import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    APP_ID,
    DEFAULT_RFC3161_TIMESTAMP_SERVER,
    EXECUTABLE_NAME,
    PRODUCT_NAME,
    SIGNING_SECRETS_PATH,
    createBuilderConfig,
    createSigntoolOptions,
    loadSigningSecrets,
} = require('./builder_config');

describe('electron-builder configuration', () => {
    it('defines signed Windows x64 NSIS metadata and bundled runtime inputs', () => {
        const config = createBuilderConfig({ certificateSubjectName: 'Example Certificate' });

        expect(config).toMatchObject({
            appId: APP_ID,
            asar: true,
            beforeBuild: expect.any(Function),
            extraMetadata: { main: 'desktop/main.js' },
            forceCodeSigning: true,
            productName: PRODUCT_NAME,
            win: {
                executableName: EXECUTABLE_NAME,
                icon: 'build/md2.ico',
                signExts: ['.dll', '.node'],
                target: [{ arch: ['x64'], target: 'nsis' }],
            },
        });
        expect(config.files).toContain('!**/*.map');
        expect(config.files).toContainEqual(expect.objectContaining({ from: '.', to: 'desktop' }));
        expect(config.files).toContainEqual(expect.objectContaining({ from: '../app/dist', to: 'desktop/renderer' }));
        expect(config.files).toContainEqual(expect.objectContaining({ from: '../shared', to: 'shared' }));
        expect(config.extraResources).toEqual([{ from: '.env', to: '.env' }]);
    });

    it('selects a certificate-store identity only when configured', () => {
        expect(createSigntoolOptions({})).not.toHaveProperty('certificateSubjectName');
        expect(createSigntoolOptions({
            certificateSha1: 'ABC123',
            certificateSubjectName: 'Example Certificate',
            publisherName: 'Example Publisher',
        })).toMatchObject({
            certificateSha1: 'ABC123',
            certificateSubjectName: 'Example Certificate',
            publisherName: 'Example Publisher',
            signingHashAlgorithms: ['sha256'],
        });
    });

    it('uses the default timestamp server unless an override is configured', () => {
        expect(createSigntoolOptions({})).toMatchObject({ rfc3161TimeStampServer: DEFAULT_RFC3161_TIMESTAMP_SERVER });
        expect(createSigntoolOptions({ rfc3161TimeStampServer: 'http://time.certum.pl' }))
            .toMatchObject({ rfc3161TimeStampServer: 'http://time.certum.pl' });
    });

    it('refuses to build without a signing identity instead of producing an unsigned app', () => {
        expect(() => createBuilderConfig({ publisherName: 'Example Publisher' })).toThrow('Missing signing identity');
        expect(() => createBuilderConfig({ certificateSha1: 'ABC123' })).not.toThrow();
    });

    it('reads signing secrets from an uncommitted json file and tolerates its absence', () => {
        const directory = mkdtempSync(path.join(tmpdir(), 'md2-signing-'));
        const secretsPath = path.join(directory, 'signing_secrets.json');
        writeFileSync(secretsPath, JSON.stringify({ publisherName: 'Example Publisher' }));

        expect(loadSigningSecrets(secretsPath)).toEqual({ publisherName: 'Example Publisher' });
        expect(loadSigningSecrets(path.join(directory, 'missing.json'))).toEqual({});
        expect(SIGNING_SECRETS_PATH.endsWith(path.join('packaging', 'signing_secrets.json'))).toBe(true);
    });
});

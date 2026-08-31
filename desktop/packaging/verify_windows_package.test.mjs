import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    assertAppContentIsReleaseSafe,
    assertPackageEntries,
    collectSignatureVerificationPaths,
    collectWindowsExecutableCodePaths,
    createAuthenticodeVerificationArgs,
    resolveArtifactPaths,
} from './verify_windows_package.mjs';

const validEntries = [
    'package.json',
    'desktop/main.js',
    'desktop/src/actions/agent/claude_usage_terminal_worker.js',
    'desktop/src/shell/preload.js',
    'desktop/renderer/index.html',
    'desktop/renderer/assets/index.js',
    'desktop/src/shell/renderer_security.js',
    'shared/action_definitions.mjs',
    'node_modules/@aptabase/electron/package.json',
    'node_modules/@sentry/electron/package.json',
    'node_modules/electron-store/package.json',
    'node_modules/electron-window-state/package.json',
    'node_modules/ssh2/package.json',
    'node_modules/ws/package.json',
];

describe('Windows package verification', () => {
    it('uses predictable versioned x64 artifact paths', () => {
        expect(resolveArtifactPaths('2.3.4', 'C:\\release')).toEqual({
            asarPath: path.join('C:\\release', 'MD2-2.3.4-win-x64-unpacked', 'resources', 'app.asar'),
            environmentPath: path.join('C:\\release', 'MD2-2.3.4-win-x64-unpacked', 'resources', '.env'),
            executablePath: path.join('C:\\release', 'MD2-2.3.4-win-x64-unpacked', 'md2.exe'),
            installerPath: path.join('C:\\release', 'MD2-Setup-2.3.4-x64.exe'),
            sourceUnpackedDirectory: path.join('C:\\release', 'win-unpacked'),
            unpackedDirectory: path.join('C:\\release', 'MD2-2.3.4-win-x64-unpacked'),
        });
    });

    it('accepts required runtime and renderer files', () => {
        expect(assertPackageEntries(validEntries)).toEqual(validEntries);
    });

    it('rejects missing renderer assets and certificate material', () => {
        expect(() => assertPackageEntries(validEntries.filter((entry) => !entry.startsWith('desktop/renderer/assets/'))))
            .toThrow('Packaged application missing renderer assets');
        expect(() => assertPackageEntries([...validEntries, 'build/signing.pfx']))
            .toThrow('Forbidden packaged files: build/signing.pfx');
        expect(() => assertPackageEntries([...validEntries, 'desktop/packaging/signing_secrets.json']))
            .toThrow('Forbidden packaged files: desktop/packaging/signing_secrets.json');
    });

    it('rejects development URLs and signing-password names in app content', () => {
        const mainEntry = path.join('desktop', 'main.js');
        const extractFile = (_asarPath, entry) => Buffer.from(entry === mainEntry ? 'http://localhost:5173' : 'release');

        expect(() => assertAppContentIsReleaseSafe('app.asar', validEntries, extractFile))
            .toThrow('Forbidden release content in desktop/main.js: http://localhost:5173');
    });

    it('recursively discovers Windows executable code and excludes irrelevant files', async () => {
        const directoryEntries = new Map([
            ['C:\\unpacked', [directoryEntry('md2.exe'), directoryEntry('resources', true), directoryEntry('LICENSE.txt')]],
            [
                path.join('C:\\unpacked', 'resources'),
                [directoryEntry('electron.dll'), directoryEntry('app.asar.unpacked', true), directoryEntry('app.asar')],
            ],
            [
                path.join('C:\\unpacked', 'resources', 'app.asar.unpacked'),
                [directoryEntry('dependency', true), directoryEntry('metadata.json')],
            ],
            [
                path.join('C:\\unpacked', 'resources', 'app.asar.unpacked', 'dependency'),
                [directoryEntry('native.node'), directoryEntry('helper.EXE'), directoryEntry('readme.md')],
            ],
        ]);
        const readDirectory = async (directory) => directoryEntries.get(directory);

        await expect(collectWindowsExecutableCodePaths('C:\\unpacked', readDirectory)).resolves.toEqual([
            path.join('C:\\unpacked', 'md2.exe'),
            path.join('C:\\unpacked', 'resources', 'app.asar.unpacked', 'dependency', 'helper.EXE'),
            path.join('C:\\unpacked', 'resources', 'app.asar.unpacked', 'dependency', 'native.node'),
            path.join('C:\\unpacked', 'resources', 'electron.dll'),
        ].sort());
    });

    it('passes all discovered executable code plus outer installer to signature verification', async () => {
        const unpackedDirectory = 'C:\\unpacked';
        const installerPath = 'C:\\release\\MD2-Setup-2.3.4-x64.exe';
        const directoryEntries = new Map([
            [unpackedDirectory, [directoryEntry('md2.exe'), directoryEntry('resources', true)]],
            [path.join(unpackedDirectory, 'resources'), [directoryEntry('native.node'), directoryEntry('data.json')]],
        ]);
        const readDirectory = async (directory) => directoryEntries.get(directory);

        await expect(collectSignatureVerificationPaths(
            { installerPath, unpackedDirectory },
            readDirectory,
        )).resolves.toEqual([
            path.join(unpackedDirectory, 'md2.exe'),
            path.join(unpackedDirectory, 'resources', 'native.node'),
            installerPath,
        ]);
    });

    it('requires configured publisher only for main executable and outer installer', () => {
        const paths = resolveArtifactPaths('2.3.4', 'C:\\release');
        const scriptPath = 'C:\\verify_authenticode.ps1';
        const runtimeDllPath = path.join(paths.unpackedDirectory, 'd3dcompiler_47.dll');

        expect(createAuthenticodeVerificationArgs(scriptPath, runtimeDllPath, 'Elastetic', paths))
            .not.toContain('-ExpectedPublisher');
        expect(createAuthenticodeVerificationArgs(scriptPath, paths.executablePath, 'Elastetic', paths))
            .toEqual(expect.arrayContaining(['-ExpectedPublisher', 'Elastetic']));
        expect(createAuthenticodeVerificationArgs(scriptPath, paths.installerPath, 'Elastetic', paths))
            .toEqual(expect.arrayContaining(['-ExpectedPublisher', 'Elastetic']));
    });
});

function directoryEntry(name, isDirectory = false) {
    return {
        isDirectory: () => isDirectory,
        isFile: () => !isDirectory,
        name,
    };
}

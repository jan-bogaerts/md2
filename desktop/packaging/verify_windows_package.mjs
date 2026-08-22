import { extractFile, listPackage } from '@electron/asar';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import packageJson from '../package.json' with { type: 'json' };

const { loadSigningSecrets } = createRequire(import.meta.url)('./builder_config');
const execFileAsync = promisify(execFile);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const releaseRoot = path.resolve(currentDirectory, '..', '..', 'release');
const REQUIRED_ASAR_ENTRIES = [
    'package.json',
    'desktop/main.js',
    'desktop/src/actions/agent/claude_usage_terminal_worker.js',
    'desktop/src/shell/preload.js',
    'desktop/renderer/index.html',
    'desktop/src/shell/renderer_security.js',
    'shared/action_definitions.mjs',
    'node_modules/@aptabase/electron/package.json',
    'node_modules/@sentry/electron/package.json',
    'node_modules/electron-store/package.json',
    'node_modules/electron-window-state/package.json',
    'node_modules/ssh2/package.json',
    'node_modules/ws/package.json',
];
const FORBIDDEN_ENTRY_PATTERN = /(?:(?:^|\/).+\.(?:key|map|p12|pem|pfx)|(?:^|\/)signing_secrets\.json)$/iu;
const FORBIDDEN_APP_CONTENT = ['http://localhost:5173', 'certificateSha1'];
const APP_OWNED_ENTRY_PATTERN = /^(?:desktop|shared)\/.+\.(?:css|html|js|json|mjs|svg|txt)$/u;
const WINDOWS_EXECUTABLE_CODE_EXTENSIONS = new Set(['.dll', '.exe', '.node']);

function normalizeAsarEntry(entry) {
    return entry.replace(/^[/\\]+/u, '').replaceAll('\\', '/');
}

export function resolveArtifactPaths(version, outputDirectory = releaseRoot) {
    const unpackedDirectoryName = `MD2-${version}-win-x64-unpacked`;
    const unpackedDirectory = path.join(outputDirectory, unpackedDirectoryName);

    return {
        asarPath: path.join(unpackedDirectory, 'resources', 'app.asar'),
        environmentPath: path.join(unpackedDirectory, 'resources', '.env'),
        executablePath: path.join(unpackedDirectory, 'md2.exe'),
        installerPath: path.join(outputDirectory, `MD2-Setup-${version}-x64.exe`),
        sourceUnpackedDirectory: path.join(outputDirectory, 'win-unpacked'),
        unpackedDirectory,
    };
}

export function assertPackageEntries(entries) {
    const normalizedEntries = entries.map(normalizeAsarEntry);
    const missingEntries = REQUIRED_ASAR_ENTRIES.filter((entry) => !normalizedEntries.includes(entry));
    if (missingEntries.length > 0) throw new Error(`Packaged application missing: ${missingEntries.join(', ')}`);

    if (!normalizedEntries.some((entry) => entry.startsWith('desktop/renderer/assets/'))) {
        throw new Error('Packaged application missing renderer assets');
    }

    const forbiddenEntries = normalizedEntries.filter((entry) => FORBIDDEN_ENTRY_PATTERN.test(entry));
    if (forbiddenEntries.length > 0) throw new Error(`Forbidden packaged files: ${forbiddenEntries.join(', ')}`);

    return normalizedEntries;
}

export function assertAppContentIsReleaseSafe(asarPath, entries, extractFileImplementation = extractFile) {
    const appEntries = entries.filter((entry) => APP_OWNED_ENTRY_PATTERN.test(entry));

    for (const entry of appEntries) {
        const archiveEntry = entry.replaceAll('/', path.sep);
        const content = extractFileImplementation(asarPath, archiveEntry);
        const forbiddenValue = FORBIDDEN_APP_CONTENT.find((value) => content.includes(Buffer.from(value)));
        if (forbiddenValue) throw new Error(`Forbidden release content in ${entry}: ${forbiddenValue}`);
    }
}

export async function collectWindowsExecutableCodePaths(directory, readDirectoryImplementation = readdir) {
    const entries = await readDirectoryImplementation(directory, { withFileTypes: true });
    const executableCodePaths = [];

    for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            const nestedExecutableCodePaths = await collectWindowsExecutableCodePaths(entryPath, readDirectoryImplementation);
            executableCodePaths.push(...nestedExecutableCodePaths);
            continue;
        }

        if (entry.isFile() && WINDOWS_EXECUTABLE_CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            executableCodePaths.push(entryPath);
        }
    }

    return executableCodePaths.sort();
}

export async function collectSignatureVerificationPaths(paths, readDirectoryImplementation = readdir) {
    const executableCodePaths = await collectWindowsExecutableCodePaths(
        paths.unpackedDirectory,
        readDirectoryImplementation,
    );
    return [...executableCodePaths, paths.installerPath];
}

async function finalizeUnpackedDirectory(paths) {
    const { sourceUnpackedDirectory, unpackedDirectory } = paths;
    if (!existsSync(sourceUnpackedDirectory)) {
        if (existsSync(unpackedDirectory)) return;

        throw new Error(`Missing unpacked application: ${sourceUnpackedDirectory}`);
    }
    if (existsSync(unpackedDirectory)) throw new Error(`Unpacked artifact already exists: ${unpackedDirectory}`);

    await rename(sourceUnpackedDirectory, unpackedDirectory);
}

async function verifySignatures(paths, expectedPublisher) {
    if (!expectedPublisher) throw new Error('publisherName in signing_secrets.json is required to verify signed artifacts');

    const scriptPath = path.join(currentDirectory, 'verify_authenticode.ps1');
    const artifactPaths = await collectSignatureVerificationPaths(paths);
    for (const artifactPath of artifactPaths) {
        const args = [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            scriptPath,
            '-ArtifactPath',
            artifactPath,
            '-ExpectedPublisher',
            expectedPublisher,
        ];
        await execFileAsync('powershell.exe', args);
    }
}

export async function verifyWindowsPackage(secrets = loadSigningSecrets()) {
    const paths = resolveArtifactPaths(packageJson.version);
    await finalizeUnpackedDirectory(paths);

    for (const artifactPath of [paths.asarPath, paths.environmentPath, paths.executablePath, paths.installerPath]) {
        if (!existsSync(artifactPath)) throw new Error(`Missing release artifact: ${artifactPath}`);
    }

    const entries = assertPackageEntries(listPackage(paths.asarPath));
    assertAppContentIsReleaseSafe(paths.asarPath, entries);
    await verifySignatures(paths, secrets.publisherName);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    verifyWindowsPackage().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

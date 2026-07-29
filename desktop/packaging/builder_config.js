const fs = require('node:fs');
const path = require('node:path');

const APP_ID = 'io.md2.desktop';
const PRODUCT_NAME = 'MD²';
const EXECUTABLE_NAME = 'md2';
const COPYRIGHT = 'Copyright © 2026 Elastetic';
const DEFAULT_RFC3161_TIMESTAMP_SERVER = 'http://timestamp.digicert.com';
const SIGNING_SECRETS_PATH = path.join(__dirname, 'signing_secrets.json');

function loadSigningSecrets(secretsPath = SIGNING_SECRETS_PATH) {
    if (!fs.existsSync(secretsPath)) return {};

    return JSON.parse(fs.readFileSync(secretsPath, 'utf8'));
}

function createSigntoolOptions(secrets = loadSigningSecrets()) {
    const options = {
        rfc3161TimeStampServer: secrets.rfc3161TimeStampServer || DEFAULT_RFC3161_TIMESTAMP_SERVER,
        signingHashAlgorithms: ['sha256'],
    };

    if (secrets.certificateSubjectName) options.certificateSubjectName = secrets.certificateSubjectName;
    if (secrets.certificateSha1) options.certificateSha1 = secrets.certificateSha1;
    if (secrets.publisherName) options.publisherName = secrets.publisherName;

    return options;
}

function assertSigningIdentityIsConfigured(secrets) {
    if (secrets.certificateSubjectName || secrets.certificateSha1) return;

    throw new Error(
        `Missing signing identity: copy signing_secrets.example.json to ${SIGNING_SECRETS_PATH} and set `
        + 'certificateSubjectName (or certificateSha1) plus publisherName.',
    );
}

function createBuilderConfig(secrets = loadSigningSecrets()) {
    assertSigningIdentityIsConfigured(secrets);

    return {
        appId: APP_ID,
        asar: true,
        copyright: COPYRIGHT,
        directories: {
            buildResources: 'build',
            output: path.join('..', 'release'),
        },
        extraResources: [{ from: '.env', to: '.env' }],
        extraMetadata: { main: 'desktop/main.js' },
        files: [
            '!**/*.map',
            {
                from: '.',
                to: '.',
                filter: ['package.json'],
            },
            {
                from: '.',
                to: 'desktop',
                filter: [
                    'main.js',
                    'src/**/*.js',
                    'src/**/*.mjs',
                    'build/md2.ico',
                    '!**/*.test.mjs',
                    '!src/integrations/test_sftp_server.mjs',
                ],
            },
            {
                from: '../app/dist',
                to: 'desktop/renderer',
                filter: ['**/*', '!**/*.map'],
            },
            {
                from: '../shared',
                to: 'shared',
                filter: ['**/*'],
            },
        ],
        forceCodeSigning: true,
        productName: PRODUCT_NAME,
        win: {
            artifactName: 'MD2-Setup-${version}-${arch}.${ext}',
            executableName: EXECUTABLE_NAME,
            icon: 'build/md2.ico',
            signtoolOptions: createSigntoolOptions(secrets),
            target: [{ arch: ['x64'], target: 'nsis' }],
        },
        nsis: {
            artifactName: 'MD2-Setup-${version}-${arch}.${ext}',
            installerIcon: 'build/md2.ico',
            uninstallerIcon: 'build/md2.ico',
        },
    };
}

module.exports = {
    APP_ID,
    COPYRIGHT,
    DEFAULT_RFC3161_TIMESTAMP_SERVER,
    EXECUTABLE_NAME,
    PRODUCT_NAME,
    SIGNING_SECRETS_PATH,
    createBuilderConfig,
    createSigntoolOptions,
    loadSigningSecrets,
};

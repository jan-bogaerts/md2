const path = require('node:path');

const APP_ID = 'io.md2.desktop';
const PRODUCT_NAME = 'MD²';
const EXECUTABLE_NAME = 'md2';
const COPYRIGHT = 'Copyright © 2026 MD²';
const RFC3161_TIMESTAMP_SERVER = 'http://timestamp.digicert.com';

function createSigntoolOptions(env = process.env) {
    const options = {
        rfc3161TimeStampServer: RFC3161_TIMESTAMP_SERVER,
        signingHashAlgorithms: ['sha256'],
    };

    if (env.WIN_CSC_SUBJECT_NAME) options.certificateSubjectName = env.WIN_CSC_SUBJECT_NAME;
    if (env.WIN_CSC_SHA1) options.certificateSha1 = env.WIN_CSC_SHA1;
    if (env.WIN_CSC_PUBLISHER_NAME) options.publisherName = env.WIN_CSC_PUBLISHER_NAME;

    return options;
}

function createBuilderConfig(env = process.env) {
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
            signtoolOptions: createSigntoolOptions(env),
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
    EXECUTABLE_NAME,
    PRODUCT_NAME,
    createBuilderConfig,
    createSigntoolOptions,
};

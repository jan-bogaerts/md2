const path = require('node:path');

module.exports = {
    appId: 'io.md2.dynamic-models-test',
    asar: true,
    asarUnpack: ['**/*.node', '**/node-pty/prebuilds/**', '**/node-pty/build/**'],
    directories: { output: path.join('..', 'release', 'dynamic-models-test') },
    electronDist: path.join(__dirname, '..', 'node_modules', 'electron', 'dist'),
    extraMetadata: { main: 'desktop/packaging/local_test_main.js' },
    extraResources: [{ from: '../release/dynamic-models-test/local-test-settings.json', to: 'local-test-settings.json' }],
    files: [
        '!**/*.map',
        { from: '.', to: '.', filter: ['package.json'] },
        { from: '.', to: 'desktop', filter: [
            'main.js', 'prepare_native_helpers.js', 'packaging/local_test_main.js', 'src/**/*.js', 'src/**/*.mjs',
            '!**/*.test.mjs', '!src/test/**/*',
        ] },
        { from: '../app/dist', to: 'desktop/renderer', filter: ['**/*', '!**/*.map'] },
        { from: '../shared', to: 'shared', filter: ['**/*.mjs'] },
    ],
    mac: { category: 'public.app-category.developer-tools', identity: null, target: ['dir'] },
    npmRebuild: false,
    productName: 'MD2 Dynamic Models Test',
};

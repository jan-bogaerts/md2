const { spawn } = require('node:child_process');
const path = require('node:path');
const { verifyRendererSourceMaps } = require('./verify_renderer_source_maps');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const SENTRY_UPLOAD_VARIABLE_NAMES = ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'];

function runNpm(args, spawnImplementation = spawn) {
    return new Promise((resolve, reject) => {
        const child = spawnImplementation('npm', args, {
            cwd: repositoryRoot,
            env: process.env,
            shell: process.platform === 'win32',
            stdio: 'inherit',
        });

        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (signal) {
                reject(new Error(`npm ${args.join(' ')} stopped by signal ${signal}`));
                return;
            }
            if (code !== 0) {
                reject(new Error(`npm ${args.join(' ')} failed with exit code ${code}`));
                return;
            }

            resolve();
        });
    });
}

/** Release builds must upload renderer source maps, so the build-only Sentry upload values are required. */
function assertSentryUploadConfigured(environment) {
    const missingNames = SENTRY_UPLOAD_VARIABLE_NAMES.filter((name) => !environment[name]?.trim());
    if (missingNames.length > 0) {
        throw new Error(`Release build requires Sentry source-map upload configuration; missing: ${missingNames.join(', ')}`);
    }
}

async function buildWindows(
    runNpmImplementation = runNpm,
    environment = process.env,
    verifySourceMapsImplementation = verifyRendererSourceMaps,
) {
    assertSentryUploadConfigured(environment);
    await runNpmImplementation(['run', 'build', '--prefix', 'app']);
    await verifySourceMapsImplementation();
    await runNpmImplementation(['run', 'package:windows', '--prefix', 'desktop']);
}

if (require.main === module) {
    buildWindows().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { buildWindows, runNpm };

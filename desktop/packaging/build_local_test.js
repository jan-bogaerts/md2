const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { build, Platform, Arch } = require('electron-builder');
const config = require('./local_test_config.cjs');
const { prepareNativeHelpers } = require('../prepare_native_helpers');

const executeFile = promisify(execFile);
const projectDirectory = path.resolve(__dirname, '..');
const outputDirectory = path.resolve(projectDirectory, config.directories.output);
const BUNDLED_CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';

/** Build an isolated local test app using the already installed native Electron runtime. */
async function buildLocalTest() {
    if (process.platform !== 'darwin') throw new Error('This local test packaging command requires macOS');
    if (process.arch !== 'arm64' && process.arch !== 'x64') throw new Error('Unsupported local test architecture');
    const codexExecutable = process.env.MD2_TEST_CODEX ?? BUNDLED_CODEX;
    const claudeExecutable = process.env.MD2_TEST_CLAUDE ?? path.join(os.homedir(), '.local', 'bin', 'claude');
    await fs.access(codexExecutable, fs.constants.X_OK);
    await fs.access(claudeExecutable, fs.constants.X_OK);
    await fs.access(path.resolve(projectDirectory, '..', 'app', 'dist', 'index.html'));
    await fs.mkdir(outputDirectory, { recursive: true });
    const settings = { codexExecutable, claudeExecutable };
    await fs.writeFile(path.join(outputDirectory, 'local-test-settings.json'), JSON.stringify(settings, null, 2));
    const architecture = process.arch === 'arm64' ? Arch.arm64 : Arch.x64;
    await build({ config, projectDir: projectDirectory, targets: Platform.MAC.createTarget('dir', architecture) });
    const appDirectory = process.arch === 'arm64' ? 'mac-arm64' : 'mac';
    const appPath = path.join(outputDirectory, appDirectory, `${config.productName}.app`);
    prepareNativeHelpers({ packageDirectory: path.join(appPath, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules', 'node-pty') });
    await executeFile('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath]);
    await executeFile('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]);
    const launcherPath = path.join(outputDirectory, 'Launch MD2 Test.command');
    const launcher = '#!/bin/zsh\nset -e\nlauncher_directory="$(cd -- "$(dirname -- "$0")" && pwd)"\n'
        + `exec /usr/bin/open "$launcher_directory/${appDirectory}/${config.productName}.app"\n`;
    await fs.writeFile(launcherPath, launcher, { mode: 0o755 });
    await fs.chmod(launcherPath, 0o755);
    console.log(`Local test app: ${appPath}`);
    console.log(`Clickable launcher: ${launcherPath}`);
}

buildLocalTest().catch((error) => { console.error(error); process.exitCode = 1; });

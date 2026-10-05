const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { resolveDesktopConfig } = require('../src/shell/config');
const { prepareNativeHelpers } = require('../prepare_native_helpers');

const TEST_APPLICATION_NAME = 'MD2 Dynamic Models Test';
const settingsPath = path.join(process.resourcesPath, 'local-test-settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
if (!path.isAbsolute(settings.codexExecutable) || !path.isAbsolute(settings.claudeExecutable)) {
    throw new Error('Local test client executable paths are required');
}
const userData = path.join(app.getPath('appData'), TEST_APPLICATION_NAME);
app.setName(TEST_APPLICATION_NAME);
app.setPath('userData', userData);
fs.mkdirSync(userData, { recursive: true });
const configurationPath = path.join(userData, 'config.json');
if (!fs.existsSync(configurationPath)) {
    const desktopConfig = resolveDesktopConfig({});
    desktopConfig.agentProfiles.find(({ name }) => name === 'codex').command = [settings.codexExecutable];
    desktopConfig.agentProfiles.find(({ name }) => name === 'claude').command = [settings.claudeExecutable];
    desktopConfig.agentSelection.settingsByAgent.codex.model = 'gpt-6.1-sol';
    desktopConfig.agentSelection.settingsByAgent.codex.thinkingLevel = 'medium';
    fs.writeFileSync(configurationPath, JSON.stringify({ desktopConfig }, null, 2));
}
const clientDirectories = [path.dirname(settings.codexExecutable), path.dirname(settings.claudeExecutable), '/opt/homebrew/bin'];
process.env.PATH = [...clientDirectories, process.env.PATH].filter((value) => !!value).join(path.delimiter);
delete process.env.MD2_AGENT;
try {
    prepareNativeHelpers({ packageDirectory: path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'node-pty') });
    require('../main');
} catch (error) {
    console.error('Local test application could not start:', error);
    app.exit(1);
}

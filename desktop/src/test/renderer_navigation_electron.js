const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow } = require('electron');
const { registerNavigationGuards } = require('../shell/renderer_security');

const NAVIGATION_SETTLE_MS = 100;
const NAVIGATION_TIMEOUT_MS = 5000;

function wait(duration) {
    return new Promise((resolve) => setTimeout(resolve, duration));
}

function waitForFrameNavigation(webContents) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for frame navigation')), NAVIGATION_TIMEOUT_MS);
        webContents.once('will-frame-navigate', ({ url }) => {
            clearTimeout(timeout);
            resolve(url);
        });
    });
}

async function ignoreExternalUrl() {}

async function runNavigationRegression() {
    const fixturesDirectory = path.join(__dirname, 'fixtures');
    const trustedPath = path.join(fixturesDirectory, 'trusted_navigation.html');
    const untrustedPath = path.join(fixturesDirectory, 'untrusted_navigation.html');
    const trustedLocation = pathToFileURL(trustedPath).href;
    const untrustedLocation = pathToFileURL(untrustedPath).href;
    const window = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    registerNavigationGuards(window.webContents, trustedLocation, ignoreExternalUrl);
    await window.loadFile(trustedPath);
    await window.webContents.executeJavaScript(`
        document.querySelector('#draft').value = 'unsaved change';
        document.querySelector('#file-link').href = ${JSON.stringify(untrustedLocation)};
    `);
    const navigationAttempt = waitForFrameNavigation(window.webContents);
    await window.webContents.executeJavaScript("document.querySelector('#file-link').click()");
    const attemptedLocation = await navigationAttempt;
    await wait(NAVIGATION_SETTLE_MS);
    const state = await window.webContents.executeJavaScript(`({
        draft: document.querySelector('#draft').value,
        location: window.location.href,
        marker: document.querySelector('#app-state').textContent,
    })`);

    if (attemptedLocation !== untrustedLocation) throw new Error(`Unexpected navigation target: ${attemptedLocation}`);
    if (state.location !== trustedLocation) throw new Error(`Trusted renderer was replaced by: ${state.location}`);
    if (state.marker !== 'trusted-renderer') throw new Error('Trusted renderer DOM was replaced');
    if (state.draft !== 'unsaved change') throw new Error('Unsaved renderer state was lost');

    window.destroy();
}

async function main() {
    try {
        await app.whenReady();
        await runNavigationRegression();
        console.log('navigation-regression-passed');
        app.quit();
    } catch (error) {
        console.error(error);
        app.exit(1);
    }
}

void main();

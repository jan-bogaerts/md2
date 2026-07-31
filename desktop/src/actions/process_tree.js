const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const FORCE_KILL_SIGNAL = 'SIGKILL';

async function terminateWindowsProcessTree(pid) {
    const argumentsList = ['/pid', String(pid), '/t', '/f'];
    await execFileAsync('taskkill.exe', argumentsList, { windowsHide: true });
}

function terminatePosixProcessGroup(pid) {
    process.kill(-pid, FORCE_KILL_SIGNAL);
}

function childHasExited(child) {
    const exited = child.exitCode !== null && child.exitCode !== undefined;
    const signalled = child.signalCode !== null && child.signalCode !== undefined;

    return exited || signalled;
}

async function terminateProcessTree(child, dependencies = {}) {
    if (!child) return false;
    const platform = dependencies.platform ?? process.platform;
    const terminateProcessGroup = dependencies.terminateProcessGroup ?? terminatePosixProcessGroup;
    const terminateWindowsTree = dependencies.terminateWindowsTree ?? terminateWindowsProcessTree;
    if (!child.pid) {
        child.kill();
        return true;
    }
    if (childHasExited(child)) return false;
    try {
        if (platform === 'win32') await terminateWindowsTree(child.pid);
        else terminateProcessGroup(child.pid);
        return true;
    } catch {
        if (childHasExited(child)) return false;
        child.kill(FORCE_KILL_SIGNAL);

        return true;
    }
}

module.exports = {terminateProcessTree};

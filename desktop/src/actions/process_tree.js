const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const WINDOWS_PROCESS_QUERY = [
    "$processes = @(Get-CimInstance Win32_Process | Select-Object Name, ProcessId, ParentProcessId)",
    '$processes | ConvertTo-Json -Compress',
].join('; ');

function descendantProcesses(processes, rootPid) {
    const descendants = [];
    const parentPids = new Set([rootPid]);
    let foundProcess = true;
    while (foundProcess) {
        foundProcess = false;
        for (const processRecord of processes) {
            if (!parentPids.has(processRecord.parentPid) || parentPids.has(processRecord.pid)) continue;
            parentPids.add(processRecord.pid);
            descendants.push(processRecord);
            foundProcess = true;
        }
    }

    return descendants;
}

async function listWindowsProcesses() {
    const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_PROCESS_QUERY],
        { windowsHide: true },
    );
    if (stdout.trim().length === 0) return [];
    const records = JSON.parse(stdout);

    return (Array.isArray(records) ? records : [records]).map((record) => ({
        name: record.Name,
        parentPid: record.ParentProcessId,
        pid: record.ProcessId,
    }));
}

async function listDescendantProcesses(rootPid) {
    if (process.platform !== 'win32' || !rootPid) return [];
    try {
        return descendantProcesses(await listWindowsProcesses(), rootPid);
    } catch (error) {
        console.warn('[agent:process-tree-query-failed]', {
            message: error instanceof Error ? error.message : String(error),
            rootPid,
        });

        return [];
    }
}

async function taskkill(pid, tree) {
    const argumentsList = ['/pid', String(pid), ...(tree ? ['/t'] : []), '/f'];
    await execFileAsync('taskkill.exe', argumentsList, { windowsHide: true });
}

async function terminateDescendantProcesses(rootPid) {
    const descendants = await listDescendantProcesses(rootPid);
    if (descendants.length === 0) return;
    console.warn('[agent:orphan-descendants]', { descendants, rootPid, timestamp: new Date().toISOString() });
    for (const { pid } of descendants.reverse()) {
        try {
            await taskkill(pid, true);
        } catch {
            // Process already exited.
        }
    }
}

async function terminateProcessTree(child) {
    if (!child.pid) {
        child.kill();
        return;
    }
    if (process.platform !== 'win32') {
        child.kill();
        return;
    }

    const descendants = await listDescendantProcesses(child.pid);
    console.log('[agent:terminate]', {
        descendants,
        pid: child.pid,
        timestamp: new Date().toISOString(),
    });
    try {
        await taskkill(child.pid, true);
    } catch {
        child.kill();
    }
    await terminateDescendantProcesses(child.pid);
}

module.exports = { descendantProcesses, listDescendantProcesses, terminateDescendantProcesses, terminateProcessTree };

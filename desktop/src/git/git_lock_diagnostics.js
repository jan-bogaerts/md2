const { execFile } = require('node:child_process');
const fs = require('node:fs');
const { promisify } = require('node:util');

const { resolveGitIndexPath } = require('./git_index_coordinator');

const execFileAsync = promisify(execFile);
const LIKELY_GIT_PROCESS_NAMES = new Set(['bash.exe', 'git.exe', 'sh.exe']);

function parseTaskList(output) {
    return output.split(/\r?\n/u).flatMap((line) => {
        const fields = [...line.matchAll(/"([^"]*)"/gu)].map((match) => match[1]);
        if (fields.length < 2 || !LIKELY_GIT_PROCESS_NAMES.has(fields[0].toLowerCase())) return [];

        return [{ name: fields[0], pid: fields[1] }];
    });
}

async function likelyGitProcesses() {
    if (process.platform !== 'win32') return [];
    try {
        const { stdout } = await execFileAsync('tasklist.exe', ['/fo', 'csv', '/nh']);

        return parseTaskList(stdout);
    } catch {
        return [];
    }
}

async function describeGitIndexLock(rootPath) {
    const indexPath = await resolveGitIndexPath(rootPath);
    const lockPath = `${indexPath}.lock`;
    let lockDescription = `Git index lock no longer exists: ${lockPath}`;
    try {
        const stats = await fs.promises.stat(lockPath);
        const ageMilliseconds = Math.max(0, Date.now() - stats.mtimeMs);
        lockDescription = `Git index lock: ${lockPath} (age ${Math.round(ageMilliseconds)} ms)`;
    } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error;
    }
    const processes = await likelyGitProcesses();
    const processDescription = processes.length > 0
        ? `Likely Git-related processes: ${processes.map(({ name, pid }) => `${name} (${pid})`).join(', ')}.`
        : 'No likely Git-related processes were found.';

    return `${lockDescription}. ${processDescription} md2 did not remove the lock.`;
}

module.exports = { describeGitIndexLock, parseTaskList };

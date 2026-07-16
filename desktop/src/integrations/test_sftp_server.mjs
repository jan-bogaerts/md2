import { open, readdir, stat } from 'node:fs/promises';
import { Server, utils } from 'ssh2';

const { OPEN_MODE, STATUS_CODE } = utils.sftp;
const TEST_USERNAME = 'root';
const TEST_PASSWORD = 'secret';
const READ_CHUNK_SIZE = 32768;

function toAttrs(stats) {
    return {
        atime: Math.floor(stats.atimeMs / 1000),
        gid: 0,
        mode: stats.mode,
        mtime: Math.floor(stats.mtimeMs / 1000),
        size: stats.size,
        uid: 0,
    };
}

function toLongname(name, stats) {
    return `${stats.isDirectory() ? 'd' : '-'}rw-r--r-- 1 root root ${stats.size} Jan 1 2026 ${name}`;
}

function nextHandle(counter) {
    const handle = Buffer.alloc(4);
    handle.writeUInt32BE(counter, 0);

    return handle;
}

function registerSftpHandlers(sftp) {
    const openDirs = new Map();
    const openFiles = new Map();
    let handleCount = 0;

    sftp.on('OPENDIR', async (reqid, requestedPath) => {
        try {
            const entries = await readdir(requestedPath);
            const handle = nextHandle(handleCount);
            openDirs.set(handleCount++, { dirPath: requestedPath, entries, offset: 0 });
            sftp.handle(reqid, handle);
        } catch {
            sftp.status(reqid, STATUS_CODE.FAILURE);
        }
    });

    sftp.on('READDIR', async (reqid, handle) => {
        const state = openDirs.get(handle.readUInt32BE(0));
        if (!state || state.offset >= state.entries.length) {
            sftp.status(reqid, STATUS_CODE.EOF);
            return;
        }

        const names = [];
        for (const name of state.entries.slice(state.offset)) {
            const stats = await stat(`${state.dirPath}/${name}`);
            names.push({ attrs: toAttrs(stats), filename: name, longname: toLongname(name, stats) });
        }
        state.offset = state.entries.length;
        sftp.name(reqid, names);
    });

    sftp.on('STAT', async (reqid, requestedPath) => {
        try {
            const stats = await stat(requestedPath);
            sftp.attrs(reqid, toAttrs(stats));
        } catch {
            sftp.status(reqid, STATUS_CODE.FAILURE);
        }
    });

    sftp.on('OPEN', async (reqid, filename, flags) => {
        if (!(flags & OPEN_MODE.READ)) {
            sftp.status(reqid, STATUS_CODE.FAILURE);
            return;
        }

        try {
            const fileHandle = await open(filename, 'r');
            const handle = nextHandle(handleCount);
            openFiles.set(handleCount++, fileHandle);
            sftp.handle(reqid, handle);
        } catch {
            sftp.status(reqid, STATUS_CODE.FAILURE);
        }
    });

    sftp.on('READ', async (reqid, handle, offset, length) => {
        const fileHandle = openFiles.get(handle.readUInt32BE(0));
        if (!fileHandle) {
            sftp.status(reqid, STATUS_CODE.FAILURE);
            return;
        }

        const buffer = Buffer.alloc(Math.min(length, READ_CHUNK_SIZE));
        const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, offset);
        if (bytesRead === 0) sftp.status(reqid, STATUS_CODE.EOF);
        else sftp.data(reqid, buffer.subarray(0, bytesRead));
    });

    sftp.on('CLOSE', async (reqid, handle) => {
        const fnum = handle.readUInt32BE(0);
        if (openFiles.has(fnum)) {
            await openFiles.get(fnum).close();
            openFiles.delete(fnum);
        }
        openDirs.delete(fnum);
        sftp.status(reqid, STATUS_CODE.OK);
    });
}

export function startTestSftpServer() {
    const hostKey = utils.generateKeyPairSync('rsa', { bits: 2048 }).private;

    const server = new Server({ hostKeys: [hostKey] }, (client) => {
        client.on('authentication', (ctx) => {
            if (ctx.username !== TEST_USERNAME) return ctx.reject();
            if (ctx.method === 'password' && ctx.password === TEST_PASSWORD) return ctx.accept();

            return ctx.reject(['password']);
        });
        client.on('ready', () => {
            client.on('session', (accept) => {
                const session = accept();
                session.on('sftp', (acceptSftp) => {
                    registerSftpHandlers(acceptSftp());
                });
            });
        });
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve({ port: server.address().port, stop: () => server.close(), username: TEST_USERNAME, password: TEST_PASSWORD });
        });
    });
}

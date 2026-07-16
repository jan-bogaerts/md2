const fs = require('node:fs');
const { Client } = require('ssh2');

const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
const CONNECT_TIMEOUT_MS = 10000;

function requireSettings(settings) {
    if (!settings || typeof settings !== 'object') throw new Error('Missing Remarkable connection settings');
    if (typeof settings.host !== 'string' || settings.host.length === 0) throw new Error('Missing Remarkable host');
    if (typeof settings.username !== 'string' || settings.username.length === 0) throw new Error('Missing Remarkable username');
    if (typeof settings.imageFolder !== 'string' || settings.imageFolder.length === 0) throw new Error('Missing Remarkable image folder');

    return settings;
}

function isSupportedImageFile(name) {
    const lower = name.toLowerCase();

    return SUPPORTED_IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function remotePath(folder, name) {
    return folder.endsWith('/') ? `${folder}${name}` : `${folder}/${name}`;
}

function connectConfig(settings) {
    const config = { host: settings.host, port: settings.port, readyTimeout: CONNECT_TIMEOUT_MS, username: settings.username };

    if (typeof settings.privateKeyPath === 'string' && settings.privateKeyPath.length > 0) {
        config.privateKey = fs.readFileSync(settings.privateKeyPath);
    } else {
        config.password = settings.password;
    }

    return config;
}

function withSftpConnection(settings, run) {
    return new Promise((resolve, reject) => {
        const client = new Client();

        client.on('ready', () => {
            client.sftp((error, sftp) => {
                if (error) {
                    client.end();
                    reject(error);
                    return;
                }

                Promise.resolve(run(sftp))
                    .then((result) => {
                        client.end();
                        resolve(result);
                    })
                    .catch((runError) => {
                        client.end();
                        reject(runError);
                    });
            });
        });
        client.on('error', reject);
        client.connect(connectConfig(requireSettings(settings)));
    });
}

function readdir(sftp, folder) {
    return new Promise((resolve, reject) => {
        sftp.readdir(folder, (error, entries) => {
            if (error) reject(error);
            else resolve(entries);
        });
    });
}

function readFile(sftp, filePath) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const stream = sftp.createReadStream(filePath);

        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

async function testConnection(settings) {
    try {
        await withSftpConnection(settings, async (sftp) => {
            await readdir(sftp, requireSettings(settings).imageFolder);
        });

        return { message: null, ok: true };
    } catch (error) {
        return { message: error instanceof Error ? error.message : 'Connection failed', ok: false };
    }
}

async function listImageFiles(settings) {
    const validated = requireSettings(settings);

    return withSftpConnection(settings, async (sftp) => {
        const entries = await readdir(sftp, validated.imageFolder);

        return entries
            .filter((entry) => entry.longname[0] !== 'd' && isSupportedImageFile(entry.filename))
            .map((entry) => ({
                modifiedTime: new Date(entry.attrs.mtime * 1000).toISOString(),
                name: entry.filename,
                path: remotePath(validated.imageFolder, entry.filename),
            }));
    });
}

function stat(sftp, filePath) {
    return new Promise((resolve, reject) => {
        sftp.stat(filePath, (error, attrs) => {
            if (error) reject(error);
            else resolve(attrs);
        });
    });
}

async function importFiles(request) {
    if (!request || typeof request !== 'object') throw new Error('Missing Remarkable import request');
    if (!Array.isArray(request.paths) || request.paths.length === 0) throw new Error('Missing Remarkable import paths');

    return withSftpConnection(request.settings, async (sftp) => {
        const assets = [];

        for (const devicePath of request.paths) {
            const attrs = await stat(sftp, devicePath);
            const content = await readFile(sftp, devicePath);
            const name = devicePath.split('/').pop();

            assets.push({
                content: content.toString('base64'),
                modifiedTime: new Date(attrs.mtime * 1000).toISOString(),
                name,
                sourcePath: devicePath,
            });
        }

        return assets;
    });
}

module.exports = {
    importFiles,
    listImageFiles,
    testConnection,
};

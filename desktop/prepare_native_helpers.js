const fs = require('node:fs');
const path = require('node:path');

const POSIX_OWNER_EXECUTE = 0o100;

/** Repair the executable bit omitted from node-pty's macOS helper in the npm package. */
function prepareNativeHelpers(options = {}) {
    const { platform = process.platform, arch = process.arch, fileSystem = fs } = options;
    if (platform !== 'darwin') return;

    const packageDirectory = options.packageDirectory ?? path.dirname(require.resolve('node-pty/package.json'));
    const directories = ['build/Release', 'build/Debug', `prebuilds/darwin-${arch}`];
    let foundHelper = false;
    for (const directory of directories) {
        const helper = path.join(packageDirectory, directory, 'spawn-helper');
        let stat;
        try {
            stat = fileSystem.lstatSync(helper);
        } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }
        if (!stat.isFile()) throw new Error('The node-pty spawn helper must be a regular file');
        foundHelper = true;
        if ((stat.mode & POSIX_OWNER_EXECUTE) === 0) {
            fileSystem.chmodSync(helper, stat.mode | POSIX_OWNER_EXECUTE);
        }
    }
    if (!foundHelper) throw new Error('Missing node-pty spawn helper; reinstall desktop dependencies');
}

if (require.main === module) prepareNativeHelpers();

module.exports = { prepareNativeHelpers };

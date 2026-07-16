const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function executableFromCommand(command) {
    if (!Array.isArray(command) || typeof command[0] !== 'string' || command[0].length === 0) {
        throw new Error('Invalid agent command');
    }

    return command[0];
}

async function executableAvailable(executable, options = {}) {
    const platform = options.platform ?? process.platform;
    const locator = platform === 'win32' ? 'where.exe' : 'which';

    try {
        await (options.execFileAsync ?? execFileAsync)(locator, [executable]);
        return true;
    } catch {
        return false;
    }
}

/** Check configured agent commands without starting provider processes. */
async function loadAgentExecutableAvailability(profiles, options = {}) {
    const availabilityEntries = await Promise.all(profiles.map(async ({ command, name }) => {
        const executable = executableFromCommand(command);
        const available = await executableAvailable(executable, options);
        const error = available ? null : `Executable not found for ${name}: ${executable}`;

        return [name, { available, error }];
    }));

    return Object.fromEntries(availabilityEntries);
}

module.exports = { executableFromCommand, loadAgentExecutableAvailability };

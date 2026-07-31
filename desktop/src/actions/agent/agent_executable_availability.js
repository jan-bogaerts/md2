const { execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function readEnvironmentValue(env, name) {
    const matchingName = Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase());

    return matchingName ? env[matchingName] : '';
}

function selectLocatedExecutable(stdout, executable, platform, env) {
    const candidates = String(stdout).split(/\r?\n/u).map((candidate) => candidate.trim()).filter((candidate) => candidate.length > 0);
    if (platform !== 'win32' || path.extname(executable).length > 0) return candidates[0] ?? null;

    const pathExtensions = readEnvironmentValue(env, 'PATHEXT').split(';').map((extension) => extension.toUpperCase());

    return candidates.find((candidate) => pathExtensions.includes(path.extname(candidate).toUpperCase())) ?? candidates[0] ?? null;
}

class AgentExecutableResolver {
    constructor(dependencies = {}) {
        this.execFileAsync = dependencies.execFileAsync ?? execFileAsync;
        this.platform = dependencies.platform ?? process.platform;
        this.resolutions = new Map();
    }

    cacheKey(executable, options) {
        const env = options.env ?? process.env;
        const cwd = options.cwd ?? process.cwd();

        return JSON.stringify([
            executable,
            cwd,
            readEnvironmentValue(env, 'PATH'),
            readEnvironmentValue(env, 'PATHEXT'),
            this.platform,
        ]);
    }

    async find(executable, options = {}) {
        const key = this.cacheKey(executable, options);
        const cached = this.resolutions.get(key);
        if (cached) return cached;

        const resolution = this.locate(executable, options);
        this.resolutions.set(key, resolution);
        const resolvedExecutable = await resolution;
        if (!resolvedExecutable) this.resolutions.delete(key);

        return resolvedExecutable;
    }

    async locate(executable, options) {
        const env = options.env ?? process.env;
        const cwd = options.cwd ?? process.cwd();
        const locator = this.platform === 'win32' ? 'where.exe' : 'which';

        try {
            const { stdout } = await this.execFileAsync(locator, [executable], { cwd, env });

            return selectLocatedExecutable(stdout, executable, this.platform, env);
        } catch {
            return null;
        }
    }
}

function executableFromCommand(command) {
    if (!Array.isArray(command) || typeof command[0] !== 'string' || command[0].length === 0) {
        throw new Error('Invalid agent command');
    }

    return command[0];
}

/** Check configured agent commands without starting provider processes. */
async function loadAgentExecutableAvailability(profiles, options = {}) {
    const resolver = options.resolver ?? new AgentExecutableResolver(options);
    const availabilityEntries = await Promise.all(profiles.map(async ({ command, name }) => {
        const executable = executableFromCommand(command);
        const available = !!await resolver.find(executable);
        const error = available ? null : `Executable not found for ${name}: ${executable}`;

        return [name, { available, error }];
    }));

    return Object.fromEntries(availabilityEntries);
}

module.exports = { AgentExecutableResolver, executableFromCommand, loadAgentExecutableAvailability };

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { calculateActivityStatsFromSources } from '../../../shared/project_stats.mjs';

function resolveSourcePath(rootPath, relativePath) {
    if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
        throw new Error(`Invalid stats source path: ${String(relativePath)}`);
    }
    const resolvedRoot = path.resolve(rootPath);
    const resolvedPath = path.resolve(resolvedRoot, relativePath);
    const rootPrefix = `${resolvedRoot.toLowerCase()}${path.sep}`;
    if (!resolvedPath.toLowerCase().startsWith(rootPrefix)) throw new Error(`Stats source escapes project root: ${relativePath}`);

    return resolvedPath;
}

async function calculate() {
    const loaded = await Promise.all(workerData.paths.map(async (relativePath) => {
        try {
            const sourcePath = resolveSourcePath(workerData.rootPath, relativePath);

            return { source: { content: await readFile(sourcePath, 'utf8'), path: relativePath }, warning: null };
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);

            return { source: null, warning: `${String(relativePath)}: ${detail}` };
        }
    }));
    const sources = loaded.flatMap(({ source }) => source ? [source] : []);
    const loadWarnings = loaded.flatMap(({ warning }) => warning ? [warning] : []);
    const calculated = calculateActivityStatsFromSources(sources);

    return { stats: calculated.stats, warnings: [...loadWarnings, ...calculated.warnings] };
}

try {
    parentPort?.postMessage({ result: await calculate() });
} catch (error) {
    parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) });
}

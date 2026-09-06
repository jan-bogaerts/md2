import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    ensureInsideRoot,
    parseShortStat,
    requireRootPath,
    runGit,
} = require('./git_commands');

describe('git-commands', () => {
    it('parses optional singular and plural short-stat categories', () => {
        expect(parseShortStat(' 3 files changed, 12 insertions(+), 1 deletion(-)')).toEqual({
            deletions: 1,
            filesChanged: 3,
            insertions: 12,
        });
        expect(parseShortStat(' 1 file changed')).toEqual({ deletions: 0, filesChanged: 1, insertions: 0 });
        expect(parseShortStat('')).toEqual({ deletions: 0, filesChanged: 0, insertions: 0 });
    });

    it('requires a project root path', () => {
        expect(() => requireRootPath({ id: 'local' })).toThrow('Missing local Git project rootPath');
    });

    it('rejects paths that escape the root', () => {
        expect(() => ensureInsideRoot('C:\\repo', 'C:\\outside\\file.md')).toThrow('Local Git path escapes project root');
    });
});

describe('git-commands working directory failures', () => {
    it('names the missing working directory instead of reporting a missing Git executable', async () => {
        const folderPath = await mkdtemp(join(tmpdir(), 'md2-git-missing-cwd-'));
        const missingPath = join(folderPath, 'gone');

        try {
            await expect(runGit(missingPath, ['status', '--porcelain']))
                .rejects.toThrow(/Git working directory does not exist/u);
            await expect(runGit(missingPath, ['status', '--porcelain'])).rejects.toThrow(missingPath);
            await expect(runGit(missingPath, ['status', '--porcelain'])).rejects.not.toThrow(/spawn git ENOENT/u);
        } finally {
            await rm(folderPath, { force: true, recursive: true });
        }
    }, 30_000);
});

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    ensureInsideRoot,
    parseShortStat,
    requireRootPath,
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

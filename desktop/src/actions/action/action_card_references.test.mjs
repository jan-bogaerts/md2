import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    appendCardReferences,
    appendCurrentCardReferences,
    parseCardReferences,
} = require('./action_card_references');

describe('action card references', () => {
    it('parses ordered unique relative and absolute paths from card frontmatter', () => {
        const content = [
            '---',
            'title: Card',
            'references:',
            '  - files/report.pdf',
            '  - C:\\outside\\source.txt',
            '  - files/report.pdf',
            'agents:',
            '  - activity.json',
            '---',
            '# Card',
        ].join('\r\n');

        expect(parseCardReferences(content)).toEqual(['files/report.pdf', 'C:\\outside\\source.txt']);
    });

    it('appends paths without contents and refreshes an existing generated list', () => {
        const preparedPrompt = appendCardReferences('Review card', ['old.txt']);
        const prompt = appendCardReferences(preparedPrompt, ['assets/spec.pdf', 'D:\\notes\\source.txt']);

        expect(prompt).toBe('Review card\n\nCard references:\n- assets/spec.pdf\n- D:\\notes\\source.txt');
        expect(prompt).not.toContain('old.txt');
        expect(appendCardReferences(prompt, [])).toBe('Review card');
        expect(appendCardReferences('Card references:\n- old.txt', [])).toBe('');
    });

    it('does not read or change non-card prompts', async () => {
        const localGitService = { loadFile: vi.fn() };

        await expect(appendCurrentCardReferences(
            'Review project',
            { kind: 'project' },
            { rootPath: 'C:/repo' },
            localGitService,
        )).resolves.toBe('Review project');
        expect(localGitService.loadFile).not.toHaveBeenCalled();
    });
});

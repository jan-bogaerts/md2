import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { MANAGED_BLOCK_BEGIN, MANAGED_BLOCK_END, updateManagedIgnoreBlock } = require('./gitignore_managed_block');

const DESIGN_BLOCK = `${MANAGED_BLOCK_BEGIN}\n/design/\n${MANAGED_BLOCK_END}\n`;

describe('updateManagedIgnoreBlock', () => {
    it('creates the managed block in empty content', () => {
        expect(updateManagedIgnoreBlock('', 'design')).toBe(DESIGN_BLOCK);
    });

    it('appends the block after unrelated content and keeps that content unchanged', () => {
        expect(updateManagedIgnoreBlock('node_modules/\n# keep\n', 'design')).toBe(`node_modules/\n# keep\n${DESIGN_BLOCK}`);
        expect(updateManagedIgnoreBlock('dist', 'design')).toBe(`dist\n${DESIGN_BLOCK}`);
    });

    it('keeps Windows newlines', () => {
        expect(updateManagedIgnoreBlock('dist\r\n', 'design'))
            .toBe(`dist\r\n${MANAGED_BLOCK_BEGIN}\r\n/design/\r\n${MANAGED_BLOCK_END}\r\n`);
    });

    it('removes only the managed block and restores the previous content', () => {
        const content = `dist\n${DESIGN_BLOCK}coverage/\n`;

        expect(updateManagedIgnoreBlock(content, null)).toBe('dist\ncoverage/\n');
    });

    it('leaves empty content when the managed block was the only content', () => {
        expect(updateManagedIgnoreBlock(DESIGN_BLOCK, null)).toBe('');
    });

    it('replaces the entry in place when the project folder changes', () => {
        const content = `dist\n${DESIGN_BLOCK}coverage/\n`;

        expect(updateManagedIgnoreBlock(content, 'docs')).toBe(`dist\n${MANAGED_BLOCK_BEGIN}\n/docs/\n${MANAGED_BLOCK_END}\ncoverage/\n`);
    });

    it('returns content without a managed block unchanged when nothing is ignored', () => {
        expect(updateManagedIgnoreBlock('dist\r\n', null)).toBe('dist\r\n');
    });

    it('escapes ignore pattern characters in the folder name', () => {
        expect(updateManagedIgnoreBlock('', 'design[1]*')).toContain('/design\\[1\\]\\*/');
    });
});

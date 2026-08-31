import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    createDiagramPath,
    formatDiagramTimestamp,
    resolveDiagramFile,
    sanitizeDiagramLabel,
} = require('./action_diagram_output');

describe('diagram output paths', () => {
    it('sanitizes Windows-invalid characters, whitespace, and reserved names', () => {
        expect(sanitizeDiagramLabel(' Project: overview / now? ')).toBe('Project-overview-now');
        expect(sanitizeDiagramLabel('CON')).toBe('diagram-CON');
    });

    it('creates repository-relative SVG paths with millisecond UTC timestamps', () => {
        const timestamp = Date.parse('2026-08-31T14:25:30.123Z');

        expect(formatDiagramTimestamp(timestamp)).toBe('20260831T142530123Z');
        expect(createDiagramPath('Project overview', 'design/diagrams', timestamp))
            .toBe('design/diagrams/Project-overview-20260831T142530123Z.svg');
    });

    it('resolves only SVG paths inside configured diagrams folder', () => {
        const project = { rootPath: 'C:/worktree' };
        const validPath = 'design/diagrams/Overview-20260831T142530123Z.svg';

        expect(resolveDiagramFile(project, 'design/diagrams', validPath))
            .toBe('C:\\worktree\\design\\diagrams\\Overview-20260831T142530123Z.svg');
        expect(() => resolveDiagramFile(project, 'design/diagrams', 'design/outside.svg'))
            .toThrow('must stay inside the configured diagrams folder');
        expect(() => resolveDiagramFile(project, 'design/diagrams', 'design/diagrams/output.txt'))
            .toThrow('must identify an SVG file');
    });
});

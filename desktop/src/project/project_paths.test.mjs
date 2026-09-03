import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DIAGRAM_FOOTER } from '../../../shared/project_config_defaults.mjs';

const require = createRequire(import.meta.url);
const { resolveProjectPaths } = require('./project_paths');

describe('resolveProjectPaths', () => {
    it('joins every configured folder onto the configured project folder', () => {
        const paths = resolveProjectPaths({
            actionsFolder: 'actions',
            diagramsFolder: 'visuals',
            projectFolder: 'projects/demo',
            releasesFolder: 'delivery/releases',
            workingFolder: 'feature_descriptions',
        });

        expect(paths).toMatchObject({
            actionsFolder: 'projects/demo/actions',
            activeCardsFolder: 'projects/demo/feature_descriptions',
            diagramsFolder: 'projects/demo/visuals',
            projectFolder: 'projects/demo',
            releasesFolder: 'projects/demo/delivery/releases',
        });
    });

    it('falls back to the shared defaults when the config omits folders', () => {
        const paths = resolveProjectPaths({});

        expect(paths).toMatchObject({
            actionsFolder: 'design/actions',
            activeCardsFolder: 'design/active',
            diagramsFolder: 'design/diagrams',
            projectFolder: 'design',
            releasesFolder: 'design/history',
        });
    });

    it('keeps folders directly under the repository root when the project folder is empty', () => {
        const paths = resolveProjectPaths({ actionsFolder: 'actions', projectFolder: '', releasesFolder: 'releases' });

        expect(paths).toMatchObject({
            actionsFolder: 'actions',
            activeCardsFolder: 'active',
            diagramsFolder: 'diagrams',
            projectFolder: '',
            releasesFolder: 'releases',
        });
    });

    // Equality, not a substring match: a substring assertion is what let the desktop copy of the
    // footer drift away from the app copy in the first place.
    it('uses the shared diagram footer verbatim when the config has none', () => {
        expect(resolveProjectPaths({}).diagramFooter).toBe(DEFAULT_DIAGRAM_FOOTER);
    });

    it('keeps a configured diagram footer and folder', () => {
        const paths = resolveProjectPaths({
            diagramFooter: 'Custom diagram instructions. Save to {{diagram-file}}.',
            diagramsFolder: 'visuals',
            projectFolder: 'design',
        });

        expect(paths.diagramFooter).toBe('Custom diagram instructions. Save to {{diagram-file}}.');
        expect(paths.diagramsFolder).toBe('design/visuals');
    });

    it.each([
        [{ releasesFolder: '' }, 'Invalid project releasesFolder'],
        [{ diagramsFolder: '' }, 'Invalid project diagramsFolder'],
        [{ workingFolder: '' }, 'Invalid project workingFolder'],
        [{ actionsFolder: '' }, 'Invalid project actionsFolder'],
        [{ diagramFooter: '' }, 'Invalid project diagramFooter'],
        [{ diagramFooter: 'Create JSON output.' }, 'requires {{diagram-file}} placeholder'],
    ])('rejects invalid project config %#', (config, message) => {
        expect(() => resolveProjectPaths(config)).toThrow(message);
    });
});

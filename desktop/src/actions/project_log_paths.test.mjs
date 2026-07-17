import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { actionHistoryFilePath, conversationLogFilePath, projectLogFolderPath } = require('./project_log_paths');
const temporaryPaths = [];

describe('project log paths', () => {
    afterEach(async () => {
        await Promise.all(temporaryPaths.splice(0).map((temporaryPath) => rm(temporaryPath, { force: true, recursive: true })));
    });

    it.each([
        ['', 'logs'],
        ['projects/demo', join('projects', 'demo', 'logs')],
    ])('resolves projectFolder %j below repository root', async (projectFolder, expectedFolder) => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-log-paths-'));
        temporaryPaths.push(rootPath);

        expect(projectLogFolderPath(rootPath, projectFolder)).toBe(join(rootPath, expectedFolder));
    });

    it('builds readable card and project conversation filenames', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-log-paths-'));
        temporaryPaths.push(rootPath);

        expect(conversationLogFilePath(rootPath, 'design', 'design/active/F-4 Something-cool.again.md', '482c00d7-ecda-40f9-ac88-e1bc719ee6aa'))
            .toBe(join(rootPath, 'design', 'logs', 'conversation__card__active_f_4_something_cool_again__482c00d7_ecda_40f9_ac88_e1bc719ee6aa.json'));
        expect(conversationLogFilePath(rootPath, 'design', 'project', '1c64c2c7-6a02-42b7-ab08-fdc15f189ae8'))
            .toBe(join(rootPath, 'design', 'logs', 'conversation__project__1c64c2c7_6a02_42b7_ab08_fdc15f189ae8.json'));
    });

    it('uses normalized action identity without generated suffixes', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-project-log-paths-'));
        temporaryPaths.push(rootPath);

        expect(actionHistoryFilePath(rootPath, 'design', 'md2.custom-prompt', { file: 'design/active/F-1.md', kind: 'card' }))
            .toBe(join(rootPath, 'design', 'logs', 'history__card__active_f_1__md2_custom_prompt.json'));
        expect(actionHistoryFilePath(rootPath, 'design', 'review-project', { kind: 'project' }))
            .toBe(join(rootPath, 'design', 'logs', 'history__project__review_project.json'));
    });
});

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { codexChangedPaths, codexTranscriptEvents } = require('./agent_codex_events');
const ROOT_PATH = 'C:\\repo';

describe('codex item vocabulary', () => {
    it('recognizes exec and app-server casings of the same file item', () => {
        const changes = [{ path: 'design\\card.md' }, { path: 'C:\\outside\\secret.md' }];

        expect(codexChangedPaths({ changes, type: 'file_change' }, ROOT_PATH)).toEqual(['design/card.md']);
        expect(codexChangedPaths({ changes, type: 'fileChange' }, ROOT_PATH)).toEqual(['design/card.md']);
        expect(codexChangedPaths({ changes, type: 'reasoning' }, ROOT_PATH)).toEqual([]);
    });

    it('reads the content field under either casing', () => {
        expect(codexTranscriptEvents({ aggregated_output: 'exec output', type: 'command_execution' }))
            .toEqual([{ content: 'exec output', toolType: 'tool.command_execution' }]);
        expect(codexTranscriptEvents({ aggregatedOutput: 'server output', type: 'commandExecution' }))
            .toEqual([{ content: 'server output', toolType: 'tool.commandExecution' }]);
    });

    it('skips items that reach the conversation through another channel', () => {
        expect(codexTranscriptEvents({ text: 'hello', type: 'agent_message' })).toEqual([]);
        expect(codexTranscriptEvents({ text: 'hello', type: 'agentMessage' })).toEqual([]);
        expect(codexTranscriptEvents({ text: 'hello', type: 'userMessage' })).toEqual([]);
        expect(codexTranscriptEvents({ message: 'boom', type: 'error' })).toEqual([]);
        expect(codexTranscriptEvents({ type: 'command_execution' })).toEqual([]);
    });
});

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { filterCompleteStderrLines, isHiddenStderrLine, stripAnsi } = require('./agent_stderr_filter');

describe('agent stderr filter', () => {
    it('hides debugger and completion noise', () => {
        expect(isHiddenStderrLine('completed')).toBe(true);
        expect(isHiddenStderrLine('  Debugger attached.  ')).toBe(true);
        expect(isHiddenStderrLine('Debugger listening on ws://127.0.0.1:9229/abc')).toBe(true);
        expect(isHiddenStderrLine('Error: something broke')).toBe(false);
    });

    it('keeps visible lines with their delimiters', () => {
        const filtered = filterCompleteStderrLines('first\r\ncompleted\nsecond\n');

        expect(filtered).toEqual({ content: 'first\r\nsecond\n', remainder: '' });
    });

    it('holds back the trailing partial line', () => {
        const filtered = filterCompleteStderrLines('done\npartial');

        expect(filtered).toEqual({ content: 'done\n', remainder: 'partial' });
    });

    it('returns no content when every complete line is hidden', () => {
        expect(filterCompleteStderrLines('completed\nDebugger attached.\n').content).toBe('');
    });

    it('removes terminal formatting from visible and hidden lines', () => {
        const escape = String.fromCharCode(27);

        expect(stripAnsi(`${escape}[31mERROR${escape}[0m`)).toBe('ERROR');
        expect(filterCompleteStderrLines(`${escape}[2mcompleted${escape}[0m\n${escape}[31mfailed${escape}[0m\n`))
            .toEqual({ content: 'failed\n', remainder: '' });
    });
});

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownDraft, type MarkdownDraftBinding } from '../../../services/markdown/markdown_draft';
import { useMarkdownDraft } from './use_markdown_draft';

describe('useMarkdownDraft', () => {
    it('flushes the outgoing buffer before replacing and binding the incoming draft', () => {
        const first = new MarkdownDraft('First');
        const second = new MarkdownDraft('Second');
        let activeDraft: MarkdownDraftBinding | undefined;
        let editorBuffer = '';
        const insertMarkdown = vi.fn();
        const replaceMarkdown = vi.fn((markdown: string) => { editorBuffer = markdown; });
        const flush = vi.fn(() => {
            activeDraft?.edit(editorBuffer);
            return true;
        });
        const bindDraft = vi.fn((draft: MarkdownDraftBinding | undefined) => { activeDraft = draft; });
        const hook = renderHook(({ draft }) => useMarkdownDraft(draft, insertMarkdown, replaceMarkdown, flush, bindDraft),
            { initialProps: { draft: first } });
        editorBuffer = 'First buffered edit';

        hook.rerender({ draft: second });

        expect(first.getSnapshot()).toBe('First buffered edit');
        expect(second.getSnapshot()).toBe('Second');
        expect(editorBuffer).toBe('Second');
        expect(flush.mock.invocationCallOrder[0]).toBeLessThan(replaceMarkdown.mock.invocationCallOrder[1]);
        expect(activeDraft).toBe(second);
        replaceMarkdown.mockClear();
        act(() => first.replace('Late first replacement'));
        act(() => first.requestFlush());
        expect(replaceMarkdown).not.toHaveBeenCalled();
        expect(flush).toHaveBeenCalledOnce();
        editorBuffer = 'Second buffered edit';
        hook.unmount();
        expect(second.getSnapshot()).toBe('Second buffered edit');
        const flushCount = flush.mock.calls.length;
        act(() => second.requestFlush());
        expect(flush).toHaveBeenCalledTimes(flushCount);
        expect(activeDraft).toBeUndefined();
    });
});

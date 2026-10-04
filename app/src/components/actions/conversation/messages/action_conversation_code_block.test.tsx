import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReactMarkdown from 'react-markdown';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from '../../../../services/clipboard_text';
import { dialogService } from '../../../../services/dialog_service';
import { ActionConversationCodeBlock } from './action_conversation_code_block';

vi.mock('../../../../services/clipboard_text', () => ({ copyTextToClipboard: vi.fn(async () => undefined) }));

function markdownBlocks(content: string) {
    return <ReactMarkdown components={{ pre: ActionConversationCodeBlock }}>{content}</ReactMarkdown>;
}

describe('ActionConversationCodeBlock', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.mocked(copyTextToClipboard).mockReset();
    });

    it.each([
        ['language fence', '```typescript\nconst value = 1;\n```', 'const value = 1;\n', 'language-typescript'],
        ['plain fence', '```\nplain code\n```', 'plain code\n', null],
        ['indented block', '    alpha\n      beta  gap', 'alpha\n  beta  gap\n', null],
        ['whitespace', '```\n  first\t  value  \n\n\tlast\n```', '  first\t  value  \n\n\tlast\n', null],
        ['empty block', '```\n```', '', null],
    ])('copies rendered text from %s without fences or trimming', async (_name, source, expected, language) => {
        const { container } = render(markdownBlocks(source));
        const code = container.querySelector('pre > code');

        expect(code).toHaveTextContent(expected, { normalizeWhitespace: false });
        if (language) expect(code).toHaveClass(language);
        expect(code).not.toContainElement(screen.getByRole('button', { name: 'Copy code block' }));
        await userEvent.click(screen.getByRole('button', { name: 'Copy code block' }));

        expect(copyTextToClipboard).toHaveBeenCalledExactlyOnceWith(expected);
    });

    it('copies multiple blocks independently and excludes inline code and prose', async () => {
        render(markdownBlocks('Before `inline`.\n\n```js\nfirst\n```\n\nBetween\n\n    second\n\nAfter'));
        const buttons = screen.getAllByRole('button', { name: 'Copy code block' });

        expect(buttons).toHaveLength(2);
        expect(screen.getByText('inline').closest('.conversation-code-block')).toBeNull();
        await userEvent.click(buttons[0]);
        await userEvent.click(buttons[1]);

        expect(copyTextToClipboard).toHaveBeenNthCalledWith(1, 'first\n');
        expect(copyTextToClipboard).toHaveBeenNthCalledWith(2, 'second\n');
    });

    it('copies updated text after a streaming render', async () => {
        const { rerender } = render(markdownBlocks('```\npartial'));
        await userEvent.click(screen.getByRole('button', { name: 'Copy code block' }));

        rerender(markdownBlocks('```\npartial complete\nnext line\n```'));
        await userEvent.click(screen.getByRole('button', { name: 'Copy code block' }));

        expect(copyTextToClipboard).toHaveBeenNthCalledWith(1, 'partial\n');
        expect(copyTextToClipboard).toHaveBeenNthCalledWith(2, 'partial complete\nnext line\n');
    });

    it('supports keyboard focus, Enter, Space, and an identifying tooltip', async () => {
        const user = userEvent.setup();
        render(markdownBlocks('```\nkeyboard\n```'));
        const button = screen.getByRole('button', { name: 'Copy code block' });

        await user.tab();
        expect(button).toHaveFocus();
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Copy code block');
        await user.keyboard('{Enter}');
        await user.keyboard(' ');

        expect(copyTextToClipboard).toHaveBeenCalledTimes(2);
        expect(copyTextToClipboard).toHaveBeenCalledWith('keyboard\n');
    });

    it('reports clipboard failure through the shared copy button', async () => {
        const failure = new Error('copy failed');
        vi.mocked(copyTextToClipboard).mockRejectedValueOnce(failure);
        const reportError = vi.spyOn(dialogService, 'error').mockReturnValue({ critical: false, id: 1, message: 'error', severity: 'error', title: 'Error' });
        render(markdownBlocks('```\ncode\n```'));

        await userEvent.click(screen.getByRole('button', { name: 'Copy code block' }));

        expect(reportError).toHaveBeenCalledWith(failure, { fallbackMessage: 'Could not copy conversation item' });
    });
});

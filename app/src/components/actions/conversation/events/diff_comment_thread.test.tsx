import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppThemeProvider } from '../../../../theme/theme_provider';
import { DiffCommentService, type DiffCommentTarget } from './diff_comment_service';
import { DiffCommentThread } from './diff_comment_thread';

function target(overrides: Partial<DiffCommentTarget> = {}): DiffCommentTarget {
    return {
        line: 7,
        lineContent: 'reviewed line',
        path: 'app/file.ts',
        revision: 'commit-1',
        side: 'new',
        ...overrides,
    };
}

function renderThread(service: DiffCommentService, commentTarget: DiffCommentTarget, onEmpty = vi.fn()) {
    return {
        onEmpty,
        ...render(
            <AppThemeProvider>
                <DiffCommentThread onEmpty={onEmpty} service={service} target={commentTarget} />
            </AppThemeProvider>,
        ),
    };
}

function openThread(service: DiffCommentService, commentTarget: DiffCommentTarget) {
    service.openComposer(commentTarget);
    return renderThread(service, commentTarget);
}

afterEach(cleanup);

describe('DiffCommentThread', () => {
    it('focuses the composer, saves a comment, and communicates session scope', async () => {
        const user = userEvent.setup();
        const service = new DiffCommentService(() => 'comment-1');
        openThread(service, target());
        const field = screen.getByRole('textbox', { name: 'Review comment' });

        expect(field).toHaveFocus();
        expect(screen.getByText(/not saved or published/u)).toBeInTheDocument();
        await user.type(field, 'Review note');
        await user.click(screen.getByRole('button', { name: 'Save comment' }));

        expect(screen.getByText('Review note')).toBeInTheDocument();
        expect(screen.queryByRole('textbox', { name: 'Review comment' })).not.toBeInTheDocument();
    });

    it('cancels only the draft with Escape', async () => {
        const user = userEvent.setup();
        const service = new DiffCommentService();
        const commentTarget = target();
        const { onEmpty } = openThread(service, commentTarget);

        await user.type(screen.getByRole('textbox', { name: 'Review comment' }), 'Discard me');
        fireEvent.keyDown(screen.getByRole('textbox', { name: 'Review comment' }), { key: 'Escape' });

        expect(service.getSnapshot(commentTarget).comments).toHaveLength(0);
        expect(service.getSnapshot(commentTarget).composer).toBeNull();
        expect(onEmpty).toHaveBeenCalledOnce();
    });

    it('submits with Ctrl+Enter and retains invalid whitespace drafts', async () => {
        const user = userEvent.setup();
        const service = new DiffCommentService(() => 'comment-1');
        const commentTarget = target();
        openThread(service, commentTarget);
        const field = screen.getByRole('textbox', { name: 'Review comment' });
        await user.type(field, '   ');
        fireEvent.keyDown(field, { ctrlKey: true, key: 'Enter' });

        expect(screen.getByText('Comment cannot be empty.')).toBeInTheDocument();
        expect(field).toHaveValue('   ');

        await user.clear(field);
        await user.type(field, 'Keyboard note');
        fireEvent.keyDown(field, { ctrlKey: true, key: 'Enter' });

        expect(screen.getByText('Keyboard note')).toBeInTheDocument();
    });

    it('edits and immediately deletes saved comments', async () => {
        const user = userEvent.setup();
        const service = new DiffCommentService(() => 'comment-1');
        const commentTarget = target();
        service.openComposer(commentTarget);
        service.updateDraft(commentTarget, 'Original');
        service.saveComposer(commentTarget);
        const { onEmpty } = renderThread(service, commentTarget);

        await user.click(screen.getByRole('button', { name: 'Edit' }));
        const field = screen.getByRole('textbox', { name: 'Review comment' });
        await user.clear(field);
        await user.type(field, 'Edited');
        await user.click(screen.getByRole('button', { name: 'Save edit' }));
        await user.click(screen.getByRole('button', { name: 'Delete' }));

        expect(service.getSnapshot(commentTarget).comments).toHaveLength(0);
        expect(onEmpty).toHaveBeenCalledOnce();
    });

    it('keeps old and new targets independent', async () => {
        const user = userEvent.setup();
        const service = new DiffCommentService();
        const oldTarget = target({ side: 'old' });
        const newTarget = target({ side: 'new' });
        service.openComposer(oldTarget);
        service.openComposer(newTarget);
        render(
            <AppThemeProvider>
                <DiffCommentThread service={service} target={oldTarget} />
                <DiffCommentThread service={service} target={newTarget} />
            </AppThemeProvider>,
        );
        const oldThread = screen.getByLabelText('old line 7 comments');
        const newThread = screen.getByLabelText('new line 7 comments');

        await user.type(within(oldThread).getByRole('textbox', { name: 'Review comment' }), 'Old note');
        await user.click(within(oldThread).getByRole('button', { name: 'Save comment' }));

        expect(within(oldThread).getByText('Old note')).toBeInTheDocument();
        expect(within(newThread).getByRole('textbox', { name: 'Review comment' })).toHaveValue('');
    });
});

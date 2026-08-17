import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CARD_TYPES, DEFAULT_STATES } from '../../../data/data_types';
import { projectSessionService } from '../../../services/project/project_session_service';
import { AppThemeProvider } from '../../../theme/theme_provider';
import { NewCardDialog } from './new_card_dialog';

interface NewCardCancellationTestSurfaceProps {
    onClose: () => void;
}

function mockMatchMedia(matches: boolean) {
    window.matchMedia = ((query: string) => ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
    })) as unknown as typeof window.matchMedia;
}

function NewCardCancellationTestSurface(props: NewCardCancellationTestSurfaceProps) {
    const { onClose } = props;
    const [open, setOpen] = useState(true);

    const openDialog = () => setOpen(true);
    const closeDialog = () => {
        onClose();
        setOpen(false);
    };

    return (
        <AppThemeProvider>
            <button onClick={openDialog} type="button">Open new card</button>
            <NewCardDialog
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={closeDialog}
                onCreateCard={vi.fn(async () => undefined)}
                open={open}
                states={DEFAULT_STATES}
            />
        </AppThemeProvider>
    );
}

function getDialogFields() {
    const dialog = screen.getByRole('dialog', { name: 'New card' });
    const title = within(dialog).getByRole('textbox', { name: 'Title' });
    const descriptionGroup = within(dialog).getByRole('group', { name: 'Description' });
    const description = within(descriptionGroup).getByRole('textbox');

    return { description, dialog, title };
}

async function dismissDialog(route: 'button' | 'escape') {
    const user = userEvent.setup();
    const { dialog, title } = getDialogFields();
    if (route === 'button') {
        await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        return;
    }

    await user.click(title);
    await user.keyboard('{Escape}');
}

describe.each([
    { isMobile: false, presentation: 'desktop' },
    { isMobile: true, presentation: 'mobile' },
])('NewCardDialog cancellation on $presentation', ({ isMobile }) => {
    afterEach(() => {
        cleanup();
        projectSessionService.newCardMarkdownDraft.replace('');
        vi.restoreAllMocks();
    });

    it.each(['button', 'escape'] as const)('rejects dirty %s cancellation once and keeps both inputs usable', async (route) => {
        mockMatchMedia(isMobile);
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const discard = vi.spyOn(projectSessionService, 'discardNewCardDraftImages').mockResolvedValue();
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(<NewCardCancellationTestSurface onClose={onClose} />);

        const initialFields = getDialogFields();
        await user.type(initialFields.title, 'Kept title');
        await user.type(initialFields.description, 'Kept body');
        await dismissDialog(route);

        expect(confirm).toHaveBeenCalledOnce();
        expect(confirm).toHaveBeenCalledWith('Discard this new card draft?');
        expect(discard).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(initialFields.title).toHaveValue('Kept title');
        expect(initialFields.description).toHaveValue('Kept body');

        await user.click(initialFields.title);
        await user.type(initialFields.title, ' updated');
        expect(initialFields.title).toHaveFocus();
        await user.click(initialFields.description);
        await user.type(initialFields.description, ' updated');
        expect(initialFields.description).toHaveFocus();
        expect(initialFields.title).toHaveValue('Kept title updated');
        expect(initialFields.description).toHaveValue('Kept body updated');
    });

    it.each(['button', 'escape'] as const)('accepts dirty %s cancellation once and reopens with usable inputs', async (route) => {
        mockMatchMedia(isMobile);
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const discard = vi.spyOn(projectSessionService, 'discardNewCardDraftImages').mockResolvedValue();
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(<NewCardCancellationTestSurface onClose={onClose} />);

        const initialFields = getDialogFields();
        await user.type(initialFields.title, 'Discarded title');
        await user.type(initialFields.description, 'Discarded body');
        await dismissDialog(route);

        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New card' })).not.toBeInTheDocument());
        expect(confirm).toHaveBeenCalledOnce();
        expect(discard).toHaveBeenCalledOnce();
        expect(onClose).toHaveBeenCalledOnce();

        await user.click(screen.getByRole('button', { name: 'Open new card' }));
        const reopenedFields = getDialogFields();
        await waitFor(() => expect(reopenedFields.title).toHaveFocus());
        expect(reopenedFields.title).toHaveValue('');
        expect(reopenedFields.description).toHaveValue('');

        await user.type(reopenedFields.title, 'Next title');
        await user.click(reopenedFields.description);
        await user.type(reopenedFields.description, 'Next body');
        expect(reopenedFields.description).toHaveFocus();
        await user.click(reopenedFields.title);
        expect(reopenedFields.title).toHaveFocus();
        expect(reopenedFields.title).toHaveValue('Next title');
        expect(reopenedFields.description).toHaveValue('Next body');
    });

    it('ignores another dismissal while confirmed cleanup remains pending', async () => {
        mockMatchMedia(isMobile);
        let resolveCleanup: () => void = () => undefined;
        const cleanupOperation = new Promise<void>((resolve) => { resolveCleanup = resolve; });
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const discard = vi.spyOn(projectSessionService, 'discardNewCardDraftImages').mockReturnValue(cleanupOperation);
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(<NewCardCancellationTestSurface onClose={onClose} />);

        const { dialog, title } = getDialogFields();
        await user.type(title, 'Pending cleanup');
        await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        await user.keyboard('{Escape}');

        expect(confirm).toHaveBeenCalledOnce();
        expect(discard).toHaveBeenCalledOnce();
        expect(onClose).not.toHaveBeenCalled();

        resolveCleanup();
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    });
});

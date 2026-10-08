import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as mdxEditor from '@mdxeditor/editor';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppThemeProvider } from '../../../theme/theme_provider';
import { MarkdownSourceModeControls } from './markdown_source_mode_controls';

function renderControls(setMode = vi.fn()) {
    const controller = { setMode };
    vi.spyOn(mdxEditor, 'useCellValues').mockReturnValue(['rich-text', controller] as never);
    render(
        <AppThemeProvider>
            <MarkdownSourceModeControls />
        </AppThemeProvider>,
    );
    return setMode;
}

describe('MarkdownSourceModeControls', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('renders icon-only buttons with accessible names and the active mode pressed', () => {
        renderControls();

        const richTextButton = screen.getByRole('button', { name: 'Rich text' });
        const sourceButton = screen.getByRole('button', { name: 'Source' });

        expect(richTextButton).toHaveTextContent('');
        expect(sourceButton).toHaveTextContent('');
        expect(richTextButton).toHaveAttribute('aria-pressed', 'true');
        expect(sourceButton).toHaveAttribute('aria-pressed', 'false');
    });

    it.each(['Rich text', 'Source'])('shows the %s tooltip on hover', async (accessibleName) => {
        renderControls();

        fireEvent.mouseOver(screen.getByRole('button', { name: accessibleName }));

        expect(await screen.findByRole('tooltip')).toHaveTextContent(accessibleName);
    });

    it('switches to source mode when the source button is clicked', () => {
        const setMode = renderControls();

        fireEvent.click(screen.getByRole('button', { name: 'Source' }));

        expect(setMode).toHaveBeenCalledExactlyOnceWith('source');
    });
});

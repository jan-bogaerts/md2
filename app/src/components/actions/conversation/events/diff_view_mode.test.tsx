import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorktreeDiffResult } from '../../../../data/electron_action_bridge';
import { configService, type DesktopConfigValues } from '../../../../services/config/config_service';
import { setDesktopConfigTransportOverride } from '../../../../services/config/desktop_config_transport';
import { AppThemeProvider } from '../../../../theme/theme_provider';
import { DiffView } from './diff_view';
import { DiffViewModeControl } from './diff_view_mode_control';

const RENAME_PATCH = [
    'diff --git a/design/old.md b/design/new.md',
    'similarity index 80%',
    'rename from design/old.md',
    'rename to design/new.md',
    '--- a/design/old.md',
    '+++ b/design/new.md',
    '@@ -4,1 +4,1 @@ section',
    '-old line',
    '+new line',
].join('\n');

function worktreeResult(): WorktreeDiffResult {
    return {
        files: [{
            changeType: 'renamed',
            newValue: 'new line',
            oldPath: 'design/old.md',
            oldValue: 'old line',
            path: 'design/new.md',
        }],
        patch: RENAME_PATCH,
        repositoryRoot: 'C:/worktree',
        revision: 'worktree-1',
    };
}

describe('diff view mode', () => {
    const saveDesktopConfig = vi.fn(async (values: DesktopConfigValues) => values);

    beforeEach(() => {
        configService.clear();
        configService.init({ desktopConfig: { diffViewType: 'split' } });
        saveDesktopConfig.mockClear();
        setDesktopConfigTransportOverride({ loadDesktopConfig: vi.fn(async () => configService.getDesktopValues()), saveDesktopConfig });
    });

    afterEach(() => {
        cleanup();
        configService.clear();
        setDesktopConfigTransportOverride(null);
        vi.restoreAllMocks();
    });

    it('persists unified view and applies it to every diff viewer', async () => {
        const user = userEvent.setup();
        const { container } = render(
            <AppThemeProvider>
                <DiffViewModeControl />
                <DiffView label="First diff" openDiffLine={vi.fn()} result={worktreeResult()} />
                <DiffView label="Second diff" openDiffLine={vi.fn()} result={worktreeResult()} />
            </AppThemeProvider>,
        );

        await user.click(await screen.findByRole('button', { name: 'Unified' }));

        await waitFor(() => expect(container.querySelectorAll('.diff-unified')).toHaveLength(2));
        expect(saveDesktopConfig).toHaveBeenCalledWith(expect.objectContaining({ diffViewType: 'unified' }));
        expect(configService.get('desktop.diffViewType')).toBe('unified');
        expect(screen.getAllByText('design/old.md \u2192 design/new.md')).toHaveLength(2);
    });
});

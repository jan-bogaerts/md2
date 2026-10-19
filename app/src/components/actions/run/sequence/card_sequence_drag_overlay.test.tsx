import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataService } from '../../../../services/data/data_service';
import { AppThemeProvider } from '../../../../theme/theme_provider';
import type { Card } from '../../../../data/data_types';
import { cardSequenceDraftService } from './card_sequence_draft_service';
import { CardSequenceDragOverlay } from './card_sequence_drag_overlay';
import { cardSequenceItemId } from './card_sequence_dnd';

const dragState = vi.hoisted(() => ({ active: null as { id: string } | null }));

vi.mock('@dnd-kit/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@dnd-kit/core')>();
    return { ...actual, useDndContext: () => dragState };
});

describe('CardSequenceDragOverlay', () => {
    afterEach(() => {
        cleanup();
        cardSequenceDraftService.close();
        dragState.active = null;
        vi.restoreAllMocks();
    });

    it('shows pointer copy for dragged row and clears it when drag ends', () => {
        const card: Card = {
            agentConversationErrors: [], agentConversations: [], content: '', hasFrontmatter: true, isActive: true,
            header: {
                affects: [], after: null, agentLogReferences: [], author: null, changedFiles: [], id: 'F-1', internalId: 'card-1',
                owner: null, policy: {}, references: [], status: 'todo', title: 'First', worktree: null,
                worktreeError: null, worktreeValue: null,
            },
            path: 'design/F-1.md',
        };
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: { branch: 'main', id: 'project', rootPath: 'C:\\project' },
            runningAgents: [],
            snapshot: {
                activeCards: [card],
                backgroundCards: [], repositoryFiles: [], workingFolder: 'design',
            },
        });
        cardSequenceDraftService.open();
        cardSequenceDraftService.refreshCardSources();
        cardSequenceDraftService.addCard('card-1');
        dragState.active = { id: cardSequenceItemId('card-1') };

        const view = render(<AppThemeProvider><CardSequenceDragOverlay /></AppThemeProvider>);
        expect(screen.getByLabelText('Dragging F-1 in sequence')).toHaveTextContent('F-1 · First');
        expect(screen.queryByText('design/F-1.md')).not.toBeInTheDocument();

        dragState.active = null;
        view.rerender(<AppThemeProvider><CardSequenceDragOverlay /></AppThemeProvider>);
        expect(screen.queryByLabelText('Dragging F-1 in sequence')).not.toBeInTheDocument();
    });
});

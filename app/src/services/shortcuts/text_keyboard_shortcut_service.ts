import { listCardCommitDiffDataSource, type ListCardCommitDiffDataSource } from '../../components/card_view/list_card_commit_diff_data_source'
import { openFilesService, type OpenFilesService } from '../open_files_service'
import { telemetryService, type TelemetryService } from '../telemetry/telemetry_service'
import type { KeyboardShortcutHandler } from './keyboard_shortcut_service'
import { NEXT_LIST_TAB_SHORTCUT, PREVIOUS_LIST_TAB_SHORTCUT } from './list_tab_shortcuts'
import { matchesKeyboardShortcut } from './matches_keyboard_shortcut'

export interface TextKeyboardShortcutServiceDependencies {
    commitDiff: ListCardCommitDiffDataSource;
    openFiles: OpenFilesService;
    telemetry: TelemetryService;
}

/** Handles shortcuts that belong only to list/text workspace view. */
export class TextKeyboardShortcutService implements KeyboardShortcutHandler {
    private readonly dependencies: TextKeyboardShortcutServiceDependencies;

    constructor(dependencies: TextKeyboardShortcutServiceDependencies) {
        this.dependencies = dependencies;
    }

    handleKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape' && this.dependencies.commitDiff.getSnapshot()) {
            event.stopPropagation();
            this.dependencies.commitDiff.clear();

            return true;
        }
        if (matchesKeyboardShortcut(event, NEXT_LIST_TAB_SHORTCUT)) return this.activateAdjacentDocument(1);
        if (matchesKeyboardShortcut(event, PREVIOUS_LIST_TAB_SHORTCUT)) return this.activateAdjacentDocument(-1);

        return false;
    }

    private activateAdjacentDocument(offset: 1 | -1) {
        this.dependencies.openFiles.activateAdjacentDocument(offset);
        this.dependencies.telemetry.trackEvent('navigation');

        return true;
    }
}

export const textKeyboardShortcutService = new TextKeyboardShortcutService({
    commitDiff: listCardCommitDiffDataSource,
    openFiles: openFilesService,
    telemetry: telemetryService,
});

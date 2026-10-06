import { openFilesService } from '../open_files_service'
import { workspaceViewService } from '../project/workspace_view_service'
import { telemetryService } from '../telemetry/telemetry_service'
import type { KeyboardShortcutBinding } from './keyboard_shortcut_service'

/** Moves to the neighbouring list tab while list view is active. */
function switchListTab(offset: 1 | -1) {
    if (workspaceViewService.getSnapshot().viewMode !== 'text') return

    openFilesService.activateAdjacentDocument(offset)
    telemetryService.trackEvent('navigation')
}

export const NEXT_LIST_TAB_SHORTCUT_BINDING: KeyboardShortcutBinding = {
    alt: false,
    ctrl: true,
    id: 'list-next-tab',
    key: 'Tab',
    mod: false,
    run: () => switchListTab(1),
    shift: false,
}

export const PREVIOUS_LIST_TAB_SHORTCUT_BINDING: KeyboardShortcutBinding = {
    alt: false,
    ctrl: true,
    id: 'list-previous-tab',
    key: 'Tab',
    mod: false,
    run: () => switchListTab(-1),
    shift: true,
}

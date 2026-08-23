import { register } from '../service_injector'
import type { KeyboardShortcutBinding } from '../shortcuts/keyboard_shortcut_service'

export const SEARCH_OPEN_REQUESTED_EVENT = 'openRequested'

/** Lets application-global commands ask the mounted search control to open. */
export class SearchOpenService extends EventTarget {
    requestOpen() {
        this.dispatchEvent(new Event(SEARCH_OPEN_REQUESTED_EVENT))
    }
}

export const searchOpenService = register('searchOpenService', new SearchOpenService())

export const GLOBAL_SEARCH_SHORTCUT_BINDING: KeyboardShortcutBinding = {
    alt: false,
    id: 'global-search',
    key: 'f',
    mod: true,
    run: () => searchOpenService.requestOpen(),
    shift: true,
}

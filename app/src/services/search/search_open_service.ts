import { register } from '../service_injector'
import type { KeyboardShortcut } from '../shortcuts/keyboard_platform'

export const SEARCH_OPEN_REQUESTED_EVENT = 'openRequested'

/** Lets application-global commands ask the mounted search control to open. */
export class SearchOpenService extends EventTarget {
    requestOpen() {
        this.dispatchEvent(new Event(SEARCH_OPEN_REQUESTED_EVENT))
    }
}

export const searchOpenService = register('searchOpenService', new SearchOpenService())

export const GLOBAL_SEARCH_SHORTCUT: KeyboardShortcut = {
    alt: false,
    ctrl: false,
    key: 'f',
    mod: true,
    shift: true,
}

export const GLOBAL_SEARCH_SHORTCUT_BINDING = GLOBAL_SEARCH_SHORTCUT

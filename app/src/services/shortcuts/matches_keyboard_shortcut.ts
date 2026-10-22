import { isApplePlatform, type KeyboardShortcut } from './keyboard_platform'

export function matchesKeyboardShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut) {
    const applePlatform = isApplePlatform();
    const expectedCtrl = shortcut.ctrl || (shortcut.mod && !applePlatform);
    const expectedMeta = shortcut.mod && applePlatform;

    return event.key.toLowerCase() === shortcut.key.toLowerCase()
        && event.ctrlKey === expectedCtrl
        && event.metaKey === expectedMeta
        && event.shiftKey === shortcut.shift
        && event.altKey === shortcut.alt;
}

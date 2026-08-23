export interface KeyboardShortcut {
    alt: boolean
    key: string
    mod: boolean
    shift: boolean
}

interface NavigatorWithUserAgentData extends Navigator {
    userAgentData?: { platform?: string }
}

/** Reports whether keyboard shortcuts should use Apple modifier glyphs. */
export function isApplePlatform() {
    const { userAgent, userAgentData } = navigator as NavigatorWithUserAgentData
    const platform = userAgentData?.platform

    if (platform !== undefined) return platform === 'macOS'

    return /Mac|iPod|iPhone|iPad/u.test(userAgent)
}

/** Formats a shortcut for the keyboard used by the current client. */
export function formatShortcut(binding: KeyboardShortcut) {
    const { alt, key, mod, shift } = binding
    if (isApplePlatform()) {
        return `${mod ? '⌘' : ''}${alt ? '⌥' : ''}${shift ? '⇧' : ''}${key.toUpperCase()}`
    }

    return [mod ? 'Ctrl' : null, alt ? 'Alt' : null, shift ? 'Shift' : null, key.toUpperCase()]
        .filter((part) => part !== null)
        .join('+')
}

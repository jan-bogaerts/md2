/** Copies text through the async Clipboard API, falling back to execCommand on insecure origins. */
export async function copyTextToClipboard(text: string): Promise<void> {
    // Remote-control pages are served over plain HTTP, so navigator.clipboard is undefined there.
    if (navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(text)
            return
        } catch {
            // Fall through to the legacy path; it still works inside a user-gesture handler.
        }
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    try {
        textarea.select()
        if (!document.execCommand('copy')) throw new Error('Clipboard copy was refused by the browser')
    } finally {
        textarea.remove()
    }
}

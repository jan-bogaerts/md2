import type { TriggerFn } from '@lexical/react/LexicalTypeaheadMenuPlugin'

const PLACEHOLDER_TRIGGER_PATTERN = /\{\{([^{}\s]*)$/u

export const matchPlaceholderTrigger: TriggerFn = (text) => {
    const match = PLACEHOLDER_TRIGGER_PATTERN.exec(text)
    if (!match) return null

    return {
        leadOffset: match.index,
        matchingString: match[1],
        replaceableString: match[0],
    }
}

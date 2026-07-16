import { MenuOption } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import type { ActionPlaceholder } from '../../data/action_placeholders'

/** Lexical typeahead option backed by one supported action placeholder. */
export class MarkdownPlaceholderOption extends MenuOption {
    readonly placeholder: ActionPlaceholder

    constructor(placeholder: ActionPlaceholder) {
        super(placeholder.name)
        this.placeholder = placeholder
    }
}

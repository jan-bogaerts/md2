import { MenuOption } from '@lexical/react/LexicalTypeaheadMenuPlugin'

/** Lexical typeahead option backed by one repository-relative file path. */
export class MarkdownFileSearchOption extends MenuOption {
    readonly repositoryPath: string

    constructor(repositoryPath: string) {
        super(repositoryPath)
        this.repositoryPath = repositoryPath
    }
}

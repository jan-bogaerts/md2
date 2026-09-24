import { $createLinkNode } from '@lexical/link'
import { $createTextNode, type TextNode } from 'lexical'
import { repositoryFileName } from './markdown_file_search'
import type { MarkdownFileSearchOption } from './markdown_file_search_option'

/** Replace active file-search query with selected repository-relative Markdown link. */
export function replaceFileSearchQuery(
    option: MarkdownFileSearchOption,
    textNodeContainingQuery: TextNode | null,
    closeMenu: () => void,
) {
    if (!textNodeContainingQuery) return

    const linkNode = $createLinkNode(option.repositoryPath)
    linkNode.append($createTextNode(repositoryFileName(option.repositoryPath)))
    textNodeContainingQuery.replace(linkNode)
    linkNode.selectEnd()
    closeMenu()
}

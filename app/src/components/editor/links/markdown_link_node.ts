import { $applyNodeReplacement, type EditorConfig, type NodeKey } from 'lexical';
import { LinkNode, type LinkAttributes, type SerializedLinkNode } from '@lexical/link';

/** Link node retaining original Markdown URL beside browser-normalized href. */
export class MarkdownLinkNode extends LinkNode {
    static getType() { return 'markdown-link'; }

    static clone(node: MarkdownLinkNode) {
        return new MarkdownLinkNode(node.getURL(), {
            rel: node.getRel(),
            target: node.getTarget(),
            title: node.getTitle(),
        }, node.__key);
    }

    constructor(url: string, attributes: LinkAttributes = {}, key?: NodeKey) {
        super(url, attributes, key);
    }

    createDOM(config: EditorConfig) {
        const element = super.createDOM(config);
        element.dataset.markdownHref = this.getURL();

        return element;
    }

    updateDOM(previousNode: this, element: HTMLAnchorElement | HTMLSpanElement, config: EditorConfig) {
        const updated = super.updateDOM(previousNode, element, config);
        element.dataset.markdownHref = this.getURL();

        return updated;
    }

    static importJSON(serializedNode: SerializedLinkNode) {
        return $createMarkdownLinkNode(serializedNode.url).updateFromJSON(serializedNode);
    }

    exportJSON(): SerializedLinkNode {
        return { ...super.exportJSON(), type: 'markdown-link', version: 1 };
    }
}

export function $createMarkdownLinkNode(url: string, attributes?: LinkAttributes) {
    return $applyNodeReplacement(new MarkdownLinkNode(url, attributes));
}

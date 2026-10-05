import { ImageNode } from '@mdxeditor/editor';
import { $applyNodeReplacement, $getState, $setState, type NodeKey, type SerializedLexicalNode } from 'lexical';
import { markdownReferenceState, type MarkdownReference } from './markdown_reference_state';

type SerializedReferenceImage = SerializedLexicalNode & {
    src: string; altText: string; title?: string; width?: number; height?: number; reference: MarkdownReference;
};

/** An ordinary MDX image whose reference metadata also survives clipboard serialization. */
export class MarkdownReferenceImageNode extends ImageNode {
    static getType() { return 'markdown-reference-image'; }

    static clone(node: MarkdownReferenceImageNode) {
        return new MarkdownReferenceImageNode(node.getSrc(), node.getAltText(), node.getTitle(), node.__key);
    }

    constructor(src: string, altText: string, title?: string, key?: NodeKey) {
        super(src, altText, title, undefined, undefined, undefined, key);
    }

    static importJSON(serialized: SerializedReferenceImage) {
        const node = $applyNodeReplacement(new MarkdownReferenceImageNode(serialized.src, serialized.altText, serialized.title));
        node.setWidthAndHeight(serialized.width ?? 'inherit', serialized.height ?? 'inherit');
        $setState(node, markdownReferenceState, serialized.reference);
        return node;
    }

    exportJSON(): SerializedReferenceImage {
        const reference = $getState(this, markdownReferenceState);
        if (!reference) throw new Error('Reference image is missing its definition');
        const width = this.getWidth();
        const height = this.getHeight();
        return {
            ...super.exportJSON(), type: MarkdownReferenceImageNode.getType(), reference,
            src: this.getSrc(), altText: this.getAltText(), title: this.getTitle(),
            width: width === 'inherit' ? undefined : width, height: height === 'inherit' ? undefined : height,
        };
    }
}

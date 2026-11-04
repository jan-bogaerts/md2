import { $createImageNode, addImportVisitor$, realmPlugin, type CreateImageNodeParameters, type MdastImportVisitor } from '@mdxeditor/editor';
import type { Html, PhrasingContent } from 'mdast';
import { $createLineBreakNode, $createParagraphNode, $isElementNode, type LexicalNode } from 'lexical';

const LITERAL_HTML_IMPORT_PRIORITY = 1;
const IMAGE_ELEMENT_NAME = 'IMG';
const SUPPORTED_IMAGE_ATTRIBUTES = new Set(['src', 'alt', 'title', 'width', 'height']);
const IMAGE_DIMENSION_ATTRIBUTES = new Set(['width', 'height']);
const IMAGE_DIMENSION_PATTERN = /^[1-9]\d*$/u;

/** Reads the image HTML written by MDXEditor for resized images; returns undefined for any other HTML. */
function parseImageHtml(html: string): CreateImageNodeParameters | undefined {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const { childNodes } = template.content;
    const image = childNodes[0];
    if (childNodes.length !== 1 || image.nodeName !== IMAGE_ELEMENT_NAME) return undefined;
    const element = image as Element;
    const supported = Array.from(element.attributes).every(({ name, value }) => SUPPORTED_IMAGE_ATTRIBUTES.has(name)
        && (!IMAGE_DIMENSION_ATTRIBUTES.has(name) || IMAGE_DIMENSION_PATTERN.test(value)));
    // getAttribute keeps relative card asset paths; the src property would resolve them to absolute URLs.
    const src = element.getAttribute('src');
    if (!supported || !src) return undefined;
    const width = element.getAttribute('width');
    const height = element.getAttribute('height');
    return {
        src, altText: element.getAttribute('alt') ?? '', title: element.getAttribute('title') ?? undefined,
        width: width ? Number(width) : undefined, height: height ? Number(height) : undefined,
    };
}

/** Appends an image node, wrapping it in a paragraph at root level like MDXEditor's own image import. */
function appendImage(lexicalParent: LexicalNode, imageParameters: CreateImageNodeParameters) {
    if (!$isElementNode(lexicalParent)) throw new Error(`Cannot import an image into a ${lexicalParent.getType()} node`);
    const image = $createImageNode(imageParameters);
    lexicalParent.append(lexicalParent.getType() === 'root' ? $createParagraphNode().append(image) : image);
}

const htmlImportVisitor: MdastImportVisitor<Html> = {
    // Override MDXEditor's default HTML image and formatting visitors too.
    priority: LITERAL_HTML_IMPORT_PRIORITY,
    testNode: 'html',
    visitNode({ mdastNode, mdastParent, lexicalParent, actions }) {
        const imageParameters = parseImageHtml(mdastNode.value);
        if (imageParameters) {
            appendImage(lexicalParent, imageParameters);
            return;
        }
        const children: PhrasingContent[] = [];
        const lines = mdastNode.value.split('\n');
        for (const [index, line] of lines.entries()) {
            if (index > 0) children.push({ type: 'break' });
            children.push({ type: 'text', value: line });
        }
        const block = mdastParent?.type === 'root' || mdastParent?.type === 'blockquote' || mdastParent?.type === 'listItem';
        const index = mdastParent?.children.indexOf(mdastNode) ?? -1;
        const previousSibling = index > 0 ? mdastParent?.children[index - 1] : undefined;
        if (block && $isElementNode(lexicalParent) && lexicalParent.getType() === 'listitem' && previousSibling?.type === 'paragraph') {
            lexicalParent.append($createLineBreakNode(), $createLineBreakNode());
        }
        // Delegate paragraph placement to the same visitor used for ordinary Markdown, including list items.
        actions.visitChildren({ type: 'root', children: block ? [{ type: 'paragraph', children }] : children }, lexicalParent);
    },
};

/** Imports supported resized-image HTML as images and all other HTML as editable literal text. */
export const plainMarkdownPlugin = realmPlugin({
    init(realm) {
        realm.pub(addImportVisitor$, htmlImportVisitor);
    },
});

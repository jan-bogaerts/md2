import {
    $isImageNode, addExportVisitor$, addImportVisitor$, addLexicalNode$, realmPlugin,
    type LexicalExportVisitor, type MdastImportVisitor,
} from '@mdxeditor/editor';
import { $createLinkNode, $isLinkNode } from '@lexical/link';
import { $applyNodeReplacement, $getRoot, $getState, $isRootNode, $setState, type LexicalNode, type RootNode } from 'lexical';
import type { Definition, ImageReference, LinkReference, Nodes, Root, RootContent } from 'mdast';
import { MarkdownReferenceImageNode } from './markdown_reference_image_node';
import { markdownDefinitionsState, markdownReferenceState, type MarkdownReference } from './markdown_reference_state';

interface ReferenceData { markdownReference?: MarkdownReference }

function definitionsInTree(node: Nodes): Definition[] {
    if (node.type === 'definition') return [node];
    if (!('children' in node)) return [];
    return node.children.flatMap(definitionsInTree);
}

function prepareReferences(node: Nodes, definitions: Definition[]) {
    if (node.type === 'linkReference' || node.type === 'imageReference') {
        // Nested table editors import the already-resolved cell tree without the parent document's definitions.
        const definition = definitions.find(({ identifier }) => identifier === node.identifier) ?? node.data?.markdownReference?.definition;
        if (!definition) throw new Error(`Missing Markdown reference definition: ${node.identifier}`);
        const { identifier, label, referenceType } = node;
        const reference: MarkdownReference = { definition, identifier, label, referenceType };
        node.data = { ...node.data, markdownReference: reference };
    }
    if ('children' in node) node.children.forEach((child) => prepareReferences(child, definitions));
}

function requiredReference(node: LinkReference | ImageReference) {
    const reference = (node.data as ReferenceData | undefined)?.markdownReference;
    if (!reference) throw new Error(`Missing resolved Markdown reference: ${node.identifier}`);
    return reference;
}

function sameDefinition(left: Definition, right: Definition) {
    return left.url === right.url && (left.title ?? null) === (right.title ?? null);
}

function referenceIsUnchanged(node: LexicalNode, reference: MarkdownReference) {
    const currentDefinition = $getState($getRoot(), markdownDefinitionsState).find(({ identifier }) => identifier === reference.identifier);
    if (currentDefinition && !sameDefinition(currentDefinition, reference.definition)) return false;
    if ($isLinkNode(node)) return node.getURL() === reference.definition.url && node.getTitle() === (reference.definition.title ?? null);
    if ($isImageNode(node)) return node.getSrc() === reference.definition.url
        && (node.getTitle() ?? null) === (reference.definition.title ?? null)
        && node.getWidth() === 'inherit' && node.getHeight() === 'inherit' && node.getRest().length === 0;
    return false;
}

function collectReferencedDefinitions(node: Nodes): Definition[] {
    const reference = (node.data as ReferenceData | undefined)?.markdownReference;
    const children = 'children' in node ? node.children.flatMap(collectReferencedDefinitions) : [];
    return reference ? [reference.definition, ...children] : children;
}

const rootImportVisitor: MdastImportVisitor<Root> = {
    priority: 1,
    testNode: 'root',
    visitNode({ mdastNode, lexicalParent, actions }) {
        const definitions = definitionsInTree(mdastNode);
        prepareReferences(mdastNode, definitions);
        const root = $getRoot();
        const existing = $isRootNode(lexicalParent) ? [] : $getState(root, markdownDefinitionsState);
        const added = definitions.filter(({ identifier }) => !existing.some((definition) => definition.identifier === identifier));
        $setState(root, markdownDefinitionsState, [...existing, ...added]);
        actions.nextVisitor();
    },
};

const referenceImportVisitor: MdastImportVisitor<LinkReference | ImageReference> = {
    testNode: (node) => node.type === 'linkReference' || node.type === 'imageReference',
    visitNode({ mdastNode, actions }) {
        const reference = requiredReference(mdastNode);
        const { url, title } = reference.definition;
        const node = mdastNode.type === 'linkReference'
            ? $createLinkNode(url, { title: title ?? undefined })
            : $applyNodeReplacement(new MarkdownReferenceImageNode(url, mdastNode.alt ?? '', title ?? undefined));
        $setState(node, markdownReferenceState, reference);
        actions.addAndStepInto(node);
    },
};

const referenceExportVisitor: LexicalExportVisitor<LexicalNode, LinkReference | ImageReference> = {
    priority: 1,
    testLexicalNode: (node): node is LexicalNode => ($isLinkNode(node) || $isImageNode(node)) && !!$getState(node, markdownReferenceState),
    visitLexicalNode({ lexicalNode, actions }) {
        const reference = $getState(lexicalNode, markdownReferenceState);
        if (!reference || !referenceIsUnchanged(lexicalNode, reference)) return actions.nextVisitor();
        const { identifier, label, referenceType } = reference;
        const text = $isImageNode(lexicalNode) ? lexicalNode.getAltText() : lexicalNode.getTextContent();
        const preservedType = referenceType === 'full' || text === label ? referenceType : 'full';
        const fields = { identifier, label, referenceType: preservedType, data: { markdownReference: reference } };
        if ($isImageNode(lexicalNode)) actions.addAndStepInto('imageReference', { ...fields, alt: text }, false);
        else actions.addAndStepInto('linkReference', fields);
    },
};

const rootExportVisitor: LexicalExportVisitor<RootNode, Root> = {
    priority: 1,
    testLexicalNode: $isRootNode,
    visitLexicalNode({ lexicalNode, mdastParent, actions }) {
        const root: Root = { type: 'root', children: [] };
        // MDXEditor accepts the traversal root here although its public type only lists root children.
        actions.appendToParent(mdastParent, root as unknown as RootContent);
        actions.visitChildren(lexicalNode, root);
        const lastChild = root.children.at(-1);
        if (root.children.length > 1 && lastChild?.type === 'paragraph' && lastChild.children.length === 0) root.children.pop();
        const definitions = [...$getState(lexicalNode, markdownDefinitionsState)];
        for (const definition of collectReferencedDefinitions(root)) {
            if (!definitions.some(({ identifier }) => identifier === definition.identifier)) definitions.push(definition);
        }
        root.children.push(...definitions);
    },
};

/** Retains document definitions and resolves references using the ordinary link and image UI. */
export const markdownReferencePlugin = realmPlugin({
    init(realm) {
        realm.pubIn({
            [addLexicalNode$]: MarkdownReferenceImageNode,
            [addImportVisitor$]: [rootImportVisitor, referenceImportVisitor, { testNode: 'definition', visitNode() {} }],
            [addExportVisitor$]: [rootExportVisitor, referenceExportVisitor],
        });
    },
});

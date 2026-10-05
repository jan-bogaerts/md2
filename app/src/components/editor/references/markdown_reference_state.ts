import { createState } from 'lexical';
import type { Definition, ImageReference, LinkReference } from 'mdast';

export interface MarkdownReference {
    definition: Definition;
    identifier: string;
    label?: string | null;
    referenceType: LinkReference['referenceType'] | ImageReference['referenceType'];
}

declare module 'mdast' {
    interface Data { markdownReference?: MarkdownReference }
}

export const markdownReferenceState = createState('markdownReference', {parse: (value): MarkdownReference | null => value === undefined ? null : value as MarkdownReference});

export const markdownDefinitionsState = createState('markdownDefinitions', {parse: (value): Definition[] => value === undefined ? [] : value as Definition[]});

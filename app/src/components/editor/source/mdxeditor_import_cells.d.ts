import type { MdastExtensions } from '@mdxeditor/editor';
import type { NodeRef } from '@mdxeditor/gurx';

// MDXEditor 4.2 exports this live parser cell at runtime but omits it from its published declarations.
declare module '@mdxeditor/editor' {
    export const mdastExtensions$: NodeRef<MdastExtensions>;
}

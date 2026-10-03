import { Cell } from '@mdxeditor/gurx';
import type { MarkdownSourceController } from './markdown_source_controller';

export const markdownSourceController$ = Cell<MarkdownSourceController | null>(null);
export const markdownSourceCanUndo$ = Cell(false);
export const markdownSourceCanRedo$ = Cell(false);
export const markdownSourceCompact$ = Cell(false);

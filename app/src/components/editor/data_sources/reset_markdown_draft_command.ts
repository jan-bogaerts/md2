import { createCommand } from 'lexical';

/** Clears transient editor controls when the mounted surface binds another draft. */
export const RESET_MARKDOWN_DRAFT_COMMAND = createCommand<void>('RESET_MARKDOWN_DRAFT_COMMAND');

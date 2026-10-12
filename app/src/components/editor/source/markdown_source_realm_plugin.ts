import { addTopAreaChild$, diffSourcePlugin, realmPlugin } from '@mdxeditor/editor';
import { markdownSourceCompact$, markdownSourceController$ } from './markdown_source_cell';
import { MarkdownSourceController, type MarkdownSourceConfig } from './markdown_source_controller';
import { MarkdownSourceRecovery } from './markdown_source_recovery';

/** Wires MDXEditor's Source mode to document-aware commands and conversion recovery. */
export const markdownSourcePlugin = realmPlugin<MarkdownSourceConfig>({
    init(realm, config) {
        if (!config) throw new Error('Markdown Source plugin requires configuration');
        const controller = new MarkdownSourceController(realm, config);
        diffSourcePlugin({ codeMirrorExtensions: controller.sourceExtensions(), viewMode: config.initialViewMode }).init?.(realm);
        realm.pubIn({
            [markdownSourceController$]: controller,
            [markdownSourceCompact$]: config.compact,
            [addTopAreaChild$]: MarkdownSourceRecovery,
        });
        config.onReady(controller);
    },
    update(realm, config) {
        if (!config) throw new Error('Markdown Source plugin requires configuration');
        const controller = realm.getValue(markdownSourceController$);
        if (controller) controller.config = config;
    },
});

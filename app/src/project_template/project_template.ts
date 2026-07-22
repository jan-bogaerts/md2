import type { MarkdownFile } from '../data/data_types'

const DEFAULT_ACTION_TEMPLATES = import.meta.glob<string>('./actions/*.json', {
    eager: true,
    import: 'default',
    query: '?raw',
})

/** Build default action files under a project's resolved actions folder. */
export function createDefaultActionFiles(actionsFolder: string): MarkdownFile[] {
    if (actionsFolder.length === 0) throw new Error('Missing default actions folder')

    return Object.entries(DEFAULT_ACTION_TEMPLATES)
        .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
        .map(([templatePath, content]) => {
            const fileName = templatePath.slice(templatePath.lastIndexOf('/') + 1)

            return { content, path: `${actionsFolder}/${fileName}` }
        })
}

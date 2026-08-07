import type { DiffFile, OpenInEditorRequest } from '../../../data/electron_action_bridge'

const LEFT_PREFIX = 'L'

/** Map a clicked diff line id (`L-<n>`/`R-<n>`) to the real project file line, or null when out of range. */
export function resolveClickedLine(file: DiffFile, lineId: string): OpenInEditorRequest | null {
    const [prefix, displayed] = lineId.split('-')
    const index = Number(displayed) - 1
    const lineNumbers = prefix === LEFT_PREFIX ? file.oldLineNumbers : file.newLineNumbers
    const line = lineNumbers[index]
    if (line === undefined) return null

    return { line, path: file.path }
}

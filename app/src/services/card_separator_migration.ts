import { buildCardId, type CardSeparator } from '../data/card_identifiers'
import type { MarkdownFile, MoveFile } from '../data/data_types'
import { markdownParsingService } from './markdown_parsing_service'

const MARKDOWN_EXTENSION = '.md'

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function splitPath(path: string) {
    const separatorIndex = path.lastIndexOf('/')

    return separatorIndex === -1
        ? { directory: '', fileName: path }
        : { directory: path.slice(0, separatorIndex), fileName: path.slice(separatorIndex + 1) }
}

function migratedContent(file: MarkdownFile, previousId: string, nextId: string) {
    const parsed = markdownParsingService.parse(file.content)

    return parsed.header.id === previousId
        ? markdownParsingService.rewriteHeader(file.content, { id: nextId })
        : file.content
}

function createMigrationMove(file: MarkdownFile, previousSeparator: CardSeparator, nextSeparator: CardSeparator): MoveFile | null {
    const { directory, fileName } = splitPath(file.path)
    const pattern = new RegExp(`^([A-Z]+)${escapeRegExp(previousSeparator)}(\\d+)${escapeRegExp(previousSeparator)}(.+)\\.md$`, 'u')
    const match = fileName.match(pattern)
    if (!match) return null

    const [, idPrefix, numberText, title] = match
    const number = Number.parseInt(numberText, 10)
    const previousId = buildCardId(idPrefix, number, previousSeparator)
    const nextId = buildCardId(idPrefix, number, nextSeparator)
    const nextTitle = title.replaceAll(previousSeparator, nextSeparator)
    const nextFileName = `${nextId}${nextSeparator}${nextTitle}${MARKDOWN_EXTENSION}`
    const toPath = directory.length > 0 ? `${directory}/${nextFileName}` : nextFileName

    return {
        content: migratedContent(file, previousId, nextId),
        encoding: file.encoding,
        fromPath: file.path,
        sha: file.sha,
        toPath,
    }
}

function validateMigrationTargets(files: MarkdownFile[], moves: MoveFile[]) {
    const existingPaths = new Set(files.map((file) => file.path))
    const sourcePaths = new Set(moves.map((move) => move.fromPath))
    const targetPaths = new Set<string>()

    for (const move of moves) {
        if (targetPaths.has(move.toPath)) throw new Error(`Multiple card files would be renamed to ${move.toPath}`)
        if (existingPaths.has(move.toPath) && !sourcePaths.has(move.toPath)) {
            throw new Error(`Cannot rename card file because the target already exists: ${move.toPath}`)
        }

        targetPaths.add(move.toPath)
    }
}

/** Plan card path and header-id updates without writing files. */
export function planCardSeparatorMigration(
    files: MarkdownFile[],
    previousSeparator: CardSeparator,
    nextSeparator: CardSeparator,
) {
    if (previousSeparator === nextSeparator) return []

    const moves = files
        .map((file) => createMigrationMove(file, previousSeparator, nextSeparator))
        .filter((move): move is MoveFile => !!move)
    validateMigrationTargets(files, moves)

    return moves
}

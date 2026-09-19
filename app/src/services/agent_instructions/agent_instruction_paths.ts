import type { MarkdownFile } from '../../data/data_types'

const AGENTS_FILE_NAME = 'agents.md'
const CLAUDE_FILE_NAME = 'claude.md'
const MARKDOWN_EXTENSION = '.md'
const README_FILE_NAMES = new Set(['readme.md', 'readme.txt'])

function normalizePath(path: string) {
    return path.replace(/\\/gu, '/').replace(/^\.\//u, '')
}

function pathDirectory(path: string) {
    const segments = normalizePath(path).split('/')
    segments.pop()

    return segments.join('/').toLowerCase()
}

function pathFileName(path: string) {
    return normalizePath(path).split('/').at(-1)?.toLowerCase() ?? ''
}

function matchesDirectRule(path: string) {
    const normalizedPath = normalizePath(path)
    const lowerPath = normalizedPath.toLowerCase()
    const fileName = pathFileName(normalizedPath)
    const isRootReadme = !normalizedPath.includes('/') && README_FILE_NAMES.has(fileName)
    const isCopilotInstructions = lowerPath === '.github/copilot-instructions.md'
    const isGithubInstructions = lowerPath.startsWith('.github/instructions/')
        && lowerPath.endsWith('.instructions.md')
    const isClaudeRule = lowerPath.startsWith('.claude/rules/') && lowerPath.endsWith(MARKDOWN_EXTENSION)

    return isRootReadme
        || fileName === AGENTS_FILE_NAME
        || isCopilotInstructions
        || isGithubInstructions
        || fileName === CLAUDE_FILE_NAME
        || isClaudeRule
}

/** Returns matching paths once, preserving repository casing and sorting by full path. */
export function findAgentInstructionPaths(repositoryPaths: readonly string[]) {
    const normalizedPaths = repositoryPaths.map(normalizePath)
    const agentDirectories = new Set(
        normalizedPaths
            .filter((path) => pathFileName(path) === AGENTS_FILE_NAME)
            .map(pathDirectory),
    )
    const pathsByLowerPath = new Map<string, string>()

    for (const path of normalizedPaths) {
        const lowerPath = path.toLowerCase()
        const isSiblingReadme = README_FILE_NAMES.has(pathFileName(path)) && agentDirectories.has(pathDirectory(path))
        if ((matchesDirectRule(path) || isSiblingReadme) && !pathsByLowerPath.has(lowerPath)) {
            pathsByLowerPath.set(lowerPath, path)
        }
    }

    return [...pathsByLowerPath.values()].sort((left, right) => left.localeCompare(right))
}

/** Removes instruction files before Markdown parsing can create cards. */
export function excludeAgentInstructionFiles(files: readonly MarkdownFile[], repositoryPaths: readonly string[]) {
    const instructionPaths = new Set(findAgentInstructionPaths(repositoryPaths).map((path) => path.toLowerCase()))

    return files.filter((file) => !instructionPaths.has(normalizePath(file.path).toLowerCase()))
}

/** Removes instruction paths from normal repository-tree input. */
export function excludeAgentInstructionPaths(repositoryPaths: readonly string[]) {
    const instructionPaths = new Set(findAgentInstructionPaths(repositoryPaths).map((path) => path.toLowerCase()))

    return repositoryPaths.filter((path) => !instructionPaths.has(normalizePath(path).toLowerCase()))
}

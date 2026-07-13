const MARKDOWN_EXTENSION = '.md'
const INVALID_NAME_CHARACTERS = /[<>:"/\\|?*]/u
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/iu

function normalizeDirectoryPath(directoryPath: string) {
    return directoryPath.replace(/\\/gu, '/').replace(/\/+$/gu, '')
}

function validateItemName(name: string) {
    if (name.length === 0) throw new Error('A name is required')
    if (name !== name.trim()) throw new Error('Names cannot start or end with spaces')
    if (name === '.' || name === '..') throw new Error('The name must identify a project item')
    if (INVALID_NAME_CHARACTERS.test(name)) throw new Error('Names cannot contain < > : " / \\ | ? or *')
    if (name.endsWith('.')) throw new Error('Names cannot end with a period')
    if (WINDOWS_RESERVED_NAMES.test(name)) throw new Error(`The name "${name}" is reserved by Windows`)
}

function validateParentDirectory(parentDirectory: string, projectFolder: string) {
    const normalizedParent = normalizeDirectoryPath(parentDirectory)
    const normalizedProjectFolder = normalizeDirectoryPath(projectFolder)
    const parentSegments = normalizedParent.split('/')
    if (/^[A-Za-z]:/u.test(normalizedParent) || normalizedParent.startsWith('/') || parentSegments.includes('.') || parentSegments.includes('..')) {
        throw new Error(`Invalid creation target: ${parentDirectory}`)
    }
    if (normalizedProjectFolder.length === 0) return normalizedParent

    if (normalizedParent !== normalizedProjectFolder && !normalizedParent.startsWith(`${normalizedProjectFolder}/`)) {
        throw new Error(`Creation target is outside the project folder: ${parentDirectory}`)
    }

    return normalizedParent
}

function joinDirectoryPath(directoryPath: string, name: string) {
    return directoryPath.length > 0 ? `${directoryPath}/${name}` : name
}

/** Build a validated project-relative path for a new folder. */
export function newFolderPath(parentDirectory: string, name: string, projectFolder: string) {
    validateItemName(name)
    const normalizedParent = validateParentDirectory(parentDirectory, projectFolder)

    return joinDirectoryPath(normalizedParent, name)
}

/** Build a validated project-relative path for a new Markdown file. */
export function newMarkdownFilePath(parentDirectory: string, name: string, projectFolder: string) {
    validateItemName(name)
    const normalizedParent = validateParentDirectory(parentDirectory, projectFolder)
    const fileName = name.toLowerCase().endsWith(MARKDOWN_EXTENSION) ? name : `${name}${MARKDOWN_EXTENSION}`

    return joinDirectoryPath(normalizedParent, fileName)
}

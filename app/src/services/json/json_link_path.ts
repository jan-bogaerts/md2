import { normalizePath } from '../../../../shared/path_utils.mjs';

export interface JsonLinkTarget {
    kind: 'local' | 'project';
    path: string;
}

function resolveSegments(sourcePath: string, linkPath: string) {
    const sourceSegments = normalizePath(sourcePath).split('/');
    sourceSegments.pop();
    const segments = linkPath.startsWith('/') ? [] : sourceSegments;
    const linkSegments = normalizePath(linkPath).replace(/^\/+/, '').split('/');

    for (const segment of linkSegments) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
            if (segments.length === 0) return null;
            segments.pop();
            continue;
        }
        segments.push(segment);
    }

    return segments.join('/');
}

function decodeFileUrl(href: string) {
    try {
        const url = new URL(href);
        if (url.protocol !== 'file:' || url.search || url.hash) return null;

        const pathname = decodeURIComponent(url.pathname);
        if (url.hostname) return normalizePath(`//${url.hostname}${pathname}`);

        return normalizePath(/^\/[a-z]:\//iu.test(pathname) ? pathname.slice(1) : pathname);
    } catch {
        return null;
    }
}

function decodeAbsolutePath(href: string) {
    const fileUrlPath = href.toLowerCase().startsWith('file:') ? decodeFileUrl(href) : null;
    if (fileUrlPath) return fileUrlPath;

    let decodedPath: string;
    try {
        decodedPath = decodeURIComponent(href);
    } catch {
        return null;
    }

    const normalizedPath = normalizePath(decodedPath);
    if (/^[a-z]:\//iu.test(normalizedPath) || normalizedPath.startsWith('//')) return normalizedPath;

    return null;
}

function projectPathFromAbsolutePath(absolutePath: string, projectRootPath: string | null) {
    if (!projectRootPath) return null;

    const normalizedRootPath = normalizePath(projectRootPath).replace(/\/+$/u, '');
    const normalizedAbsolutePath = normalizePath(absolutePath);
    const rootPrefix = `${normalizedRootPath}/`;
    if (!normalizedAbsolutePath.toLowerCase().startsWith(rootPrefix.toLowerCase())) return null;

    return normalizedAbsolutePath.slice(rootPrefix.length);
}

function projectTarget(path: string, repositoryPaths: readonly string[]): JsonLinkTarget {
    const normalizedPath = normalizePath(path);
    const repositoryPath = repositoryPaths.find((candidate) => (
        normalizePath(candidate).toLowerCase() === normalizedPath.toLowerCase()
    ));

    return { kind: 'project', path: repositoryPath ?? normalizedPath };
}

/** Resolves a Markdown JSON link to either an active-project path or an absolute local path. */
export function resolveJsonLink(
    sourcePath: string,
    href: string,
    projectRootPath: string | null,
    repositoryPaths: readonly string[],
): JsonLinkTarget | null {
    const trimmedHref = href.trim();
    if (!trimmedHref || trimmedHref.startsWith('#')) return null;
    if (trimmedHref.includes('?') || trimmedHref.includes('#')) return null;

    const absolutePath = decodeAbsolutePath(trimmedHref);
    if (absolutePath) {
        if (!absolutePath.toLowerCase().endsWith('.json')) return null;

        const projectPath = projectPathFromAbsolutePath(absolutePath, projectRootPath);
        return projectPath ? projectTarget(projectPath, repositoryPaths) : { kind: 'local', path: absolutePath };
    }
    if (/^[a-z][a-z\d+.-]*:/iu.test(trimmedHref) || trimmedHref.startsWith('//')) return null;

    let decodedPath: string;
    try {
        decodedPath = decodeURIComponent(trimmedHref);
    } catch {
        return null;
    }
    if (!decodedPath.toLowerCase().endsWith('.json')) return null;

    const resolvedPath = resolveSegments(sourcePath, decodedPath);
    if (!resolvedPath) return null;

    return projectTarget(resolvedPath, repositoryPaths);
}

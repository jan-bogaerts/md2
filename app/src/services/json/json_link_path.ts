import { normalizePath } from '../../../../shared/path_utils.mjs';

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

/** Resolves one Markdown link to an existing repository JSON path, or leaves normal link handling intact. */
export function resolveJsonProjectLink(
    sourcePath: string,
    href: string,
    repositoryPaths: readonly string[],
) {
    const trimmedHref = href.trim();
    if (!trimmedHref || trimmedHref.startsWith('#') || trimmedHref.startsWith('//')) return null;
    if (/^[a-z][a-z\d+.-]*:/iu.test(trimmedHref)) return null;
    if (trimmedHref.includes('?') || trimmedHref.includes('#')) return null;

    let decodedPath: string;
    try {
        decodedPath = decodeURIComponent(trimmedHref);
    } catch {
        return null;
    }
    if (!decodedPath.toLowerCase().endsWith('.json')) return null;

    const resolvedPath = resolveSegments(sourcePath, decodedPath);
    if (!resolvedPath) return null;
    const normalizedResolvedPath = normalizePath(resolvedPath);

    return repositoryPaths.find((path) => normalizePath(path) === normalizedResolvedPath) ?? normalizedResolvedPath;
}

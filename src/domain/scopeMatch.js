import { DomainInvariantError } from './errors';

/** Workspace path scope grammar shared by the position catalog and manifest audit.
 *
 * A scope is a workspace-relative, forward-slash pattern of segments:
 *   - a literal segment:            `Source`, `Config`
 *   - a single-star segment:        `*.uproject`, `memory*.js`, `*`
 *     (at most one `*`, leading, trailing, or alone, within one segment)
 *   - a trailing `**` segment:      `Source/**`  (matches the directory itself
 *     and everything beneath it)
 *
 * Matching is deterministic and case-sensitive; there is no `..`, no absolute
 * paths, and no other glob syntax, so scopes can never express escapes upward. */

const SEGMENT_PATTERN = /^[A-Za-z0-9_.-]*\*?[A-Za-z0-9_.-]*$/;

/** Validate one scope pattern; throws a domain error with a stable code when invalid. */
export function assertScopePattern(pattern) {
    if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 200) {
        throw new DomainInvariantError('invalid-scope-pattern', 'A scope pattern must be a bounded, workspace-relative string.');
    }
    const segments = pattern.split('/');
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (segment === '**') {
            if (index !== segments.length - 1) {
                throw new DomainInvariantError('invalid-scope-pattern', 'A ** segment is allowed only as the final segment of a scope.');
            }
            continue;
        }
        if (!SEGMENT_PATTERN.test(segment) || !/\*?[A-Za-z0-9_-]/.test(segment)) {
            throw new DomainInvariantError('invalid-scope-pattern', `Scope segment "${segment}" is not a literal, single-star segment, or **.`);
        }
    }
    return pattern;
}

function segmentMatches(segment, value) {
    if (!segment.includes('*')) return segment === value;
    if (segment === '*') return value.length > 0;
    if (segment.startsWith('*')) return value.endsWith(segment.slice(1)) && value.length > segment.length - 1;
    if (segment.endsWith('*')) return value.startsWith(segment.slice(0, -1)) && value.length > segment.length - 1;
    const [prefix, suffix] = segment.split('*');
    return value.startsWith(prefix) && value.endsWith(suffix) && value.length >= prefix.length + suffix.length;
}

/** Whether a workspace-relative path is covered by one scope pattern. */
export function pathMatchesScope(path, pattern) {
    if (typeof path !== 'string' || !path.trim()) return false;
    const valueSegments = path.split('/');
    const patternSegments = assertScopePattern(pattern).split('/');
    const hasDoubleStar = patternSegments[patternSegments.length - 1] === '**';
    const literalCount = hasDoubleStar ? patternSegments.length - 1 : patternSegments.length;
    if (valueSegments.length < literalCount || (!hasDoubleStar && valueSegments.length !== literalCount)) return false;
    for (let index = 0; index < literalCount; index += 1) {
        if (!segmentMatches(patternSegments[index], valueSegments[index])) return false;
    }
    return true;
}

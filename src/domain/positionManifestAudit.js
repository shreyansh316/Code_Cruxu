import { DomainInvariantError } from './errors';
import { pathMatchesScope } from './scopeMatch';

/** Compare a persisted task grant manifest against a catalog position's declared
 * workspace and command scope. These declarations constrain grants when a persisted
 * employee maps to a catalog position; they never create permissions. */

const MAX_PATHS = 100;
const MAX_COMMANDS = 20;

function commandName(command) {
    return command.split(/[\\/]/).at(-1).trimEnd().replace(/[. ]+$/g, '')
        .replace(/\.(?:exe|com|bat|cmd)$/i, '').toLocaleLowerCase('en-US');
}

function requirePosition(position) {
    if (!position || typeof position !== 'object'
        || !Array.isArray(position.readScope) || !Array.isArray(position.writeScope)
        || !Array.isArray(position.commandScope)
        || typeof position.name !== 'string' || !position.name.trim()) {
        throw new DomainInvariantError('invalid-position-audit-input', 'The audit requires a catalog position with readScope, writeScope, and commandScope arrays.');
    }
    return position;
}

function requirePaths(value, field) {
    if (!Array.isArray(value) || value.length > MAX_PATHS
        || value.some((path) => typeof path !== 'string' || !path.trim() || path.trim().length > 260
            || path.includes('..') || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path))) {
        throw new DomainInvariantError('invalid-position-audit-input', `${field} must hold at most ${MAX_PATHS} bounded, workspace-relative paths.`);
    }
    return value.map((path) => path.trim());
}

function requireCommands(value) {
    if (!Array.isArray(value) || value.length > MAX_COMMANDS
        || value.some((entry) => !entry || typeof entry.command !== 'string' || !entry.command.trim()
            || entry.command.length > 260 || (entry.args !== undefined && !Array.isArray(entry.args)))) {
        throw new DomainInvariantError('invalid-position-audit-input', `commands must hold at most ${MAX_COMMANDS} entries with a command name.`);
    }
    return value;
}

/** Compare one manifest against one position. Violations are ordered by reads,
 * writes, and commands, preserving input order within each category. */
export function auditTaskToolPermissions(position, manifest = {}) {
    requirePosition(position);
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new DomainInvariantError('invalid-position-audit-input', 'The audit requires a manifest object.');
    }
    const readFiles = requirePaths(manifest.readFiles ?? [], 'readFiles');
    const writeFiles = requirePaths(manifest.writeFiles ?? [], 'writeFiles');
    const commands = requireCommands(manifest.commands ?? []);
    const violations = [];
    for (const path of readFiles) {
        if (!position.readScope.some((scope) => pathMatchesScope(path, scope))) {
            violations.push(Object.freeze({ kind: 'read', value: path,
                detail: `No readScope of position "${position.name}" covers this path.` }));
        }
    }
    for (const path of writeFiles) {
        if (!position.writeScope.some((scope) => pathMatchesScope(path, scope))) {
            violations.push(Object.freeze({ kind: 'write', value: path,
                detail: `No writeScope of position "${position.name}" covers this path.` }));
        }
    }
    const declaredCommands = new Set(position.commandScope.map((scope) => scope.toLocaleLowerCase('en-US')));
    for (const entry of commands) {
        if (!declaredCommands.has(commandName(entry.command))) {
            violations.push(Object.freeze({ kind: 'command', value: entry.command,
                detail: `Command is not in the commandScope of position "${position.name}".` }));
        }
    }
    return Object.freeze({ withinScope: violations.length === 0, violations: Object.freeze(violations) });
}

/** Fail closed when a grant exceeds a mapped employee position's declared scope. */
export function assertTaskToolPermissionsWithinPosition(position, manifest) {
    const report = auditTaskToolPermissions(position, manifest);
    if (!report.withinScope) {
        throw new DomainInvariantError('task-tool-position-scope-forbidden',
            `Task tool grants exceed the declared scope for position "${position.name}" (${report.violations.length} violation(s)).`);
    }
    return report;
}

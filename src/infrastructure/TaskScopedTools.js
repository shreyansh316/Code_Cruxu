import { realpath } from 'fs/promises';
import { isAbsolute, relative, sep } from 'path';
import { DomainInvariantError } from '../domain/errors';
import { normalizeAllowedExecutable, validateCommandArguments } from './commandPolicy';
import { isSensitiveWorkspacePath } from './sensitiveWorkspacePath';
import { hasWindowsPathAlias } from './workspacePathPolicy';

/** Restrict existing workspace/process adapters to a task's explicit permission manifest. */
export async function createTaskScopedTools({ workspaceRoot, filesystem, processRunner, permissions } = {}) {
    if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim()
        || typeof filesystem?.readFile !== 'function' || typeof filesystem?.writeFile !== 'function'
        || typeof processRunner?.execute !== 'function' || !permissions || typeof permissions !== 'object'
        || !Array.isArray(permissions.readFiles) || !Array.isArray(permissions.writeFiles)
        || !Array.isArray(permissions.commands) || permissions.readFiles.length > 100
        || permissions.writeFiles.length > 100 || permissions.commands.length > 20) invalid();
    const root = await realpath(workspaceRoot);
    const readFiles = pathSet(permissions.readFiles);
    const writeFiles = pathSet(permissions.writeFiles);
    const commands = new Map();
    for (const permission of permissions.commands) {
        if (!permission || typeof permission.command !== 'string' || !permission.command.trim()
            || !Array.isArray(permission.args) || permission.args.length > 100
            || permission.args.some((argument) => typeof argument !== 'string')) invalid();
        validateCommandArguments(permission.args);
        const executable = normalizeAllowedExecutable(permission.command);
        if (commands.has(executable)) invalid();
        commands.set(executable, Object.freeze([...permission.args]));
    }
    return Object.freeze({
        filesystem: Object.freeze({
            readFile(path, options) {
                const normalized = relativePath(path);
                if (isSensitiveWorkspacePath(normalized) || !readFiles.has(normalized)) return Promise.reject(denied());
                return filesystem.readFile(normalized, options);
            },
            writeFile(path, contents, options) {
                const normalized = relativePath(path);
                if (isSensitiveWorkspacePath(normalized) || !writeFiles.has(normalized)) return Promise.reject(denied());
                return filesystem.writeFile(normalized, contents, options);
            },
            createFile(path, contents, options) {
                const normalized = relativePath(path);
                if (isSensitiveWorkspacePath(normalized) || !writeFiles.has(normalized) || typeof filesystem.createFile !== 'function') return Promise.reject(denied());
                return filesystem.createFile(normalized, contents, options);
            },
            deleteFile(path, options) {
                const normalized = relativePath(path);
                if (isSensitiveWorkspacePath(normalized) || !writeFiles.has(normalized) || typeof filesystem.deleteFile !== 'function') return Promise.reject(denied());
                return filesystem.deleteFile(normalized, options);
            },
            renameFile(path, newPath, options) {
                const normalized = relativePath(path);
                const normalizedNewPath = relativePath(newPath);
                if (isSensitiveWorkspacePath(normalized) || isSensitiveWorkspacePath(normalizedNewPath)
                    || !writeFiles.has(normalized) || !writeFiles.has(normalizedNewPath)
                    || typeof filesystem.renameFile !== 'function') return Promise.reject(denied());
                return filesystem.renameFile(normalized, normalizedNewPath, options);
            },
        }),
        process: Object.freeze({
            async execute(request = {}) {
                let executable = '';
                try { executable = normalizeAllowedExecutable(request.command); }
                catch { throw denied(); }
                const allowedArgs = commands.get(executable);
                try { validateCommandArguments(request.args); }
                catch { throw denied(); }
                if (!allowedArgs || !sameArray(request.args, allowedArgs)) throw denied();
                const cwd = request.cwd === undefined ? root : await realpath(request.cwd);
                const rel = relative(root, cwd);
                if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw denied();
                return processRunner.execute({ ...request, cwd });
            },
        }),
    });
}

function pathSet(paths) {
    const result = new Set();
    for (const path of paths) {
        const normalized = relativePath(path);
        if (result.has(normalized)) invalid();
        result.add(normalized);
    }
    return result;
}
function relativePath(path) {
    if (typeof path !== 'string' || !path.trim() || path.includes('\0') || path.includes(':') || isAbsolute(path)
        || path.split(/[\\/]/).some((part) => part === '..' || part === '.' || hasWindowsPathAlias(part))) invalid();
    return path.replaceAll('\\', '/');
}
function sameArray(actual, expected) {
    return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}
function denied() {
    return new DomainInvariantError('task-tool-not-authorized', 'Tool operation is not authorized by this task permission set.');
}
function invalid() {
    throw new DomainInvariantError('invalid-task-tool-permissions', 'Task tool permission manifest is malformed or exceeds its bounds.');
}

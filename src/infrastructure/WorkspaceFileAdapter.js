import { lstat, open, realpath, readdir, rename, unlink, writeFile } from 'fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'path';
import { DomainInvariantError } from '../domain/errors';
import { isSensitiveWorkspacePath } from './sensitiveWorkspacePath';
import { hasWindowsPathAlias } from './workspacePathPolicy';

const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
const HARD_MAX_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES_PER_SCAN = 500;
const HARD_MAX_FILES_PER_SCAN = 5000;
const DEFAULT_MAX_OPERATIONS = 1000;
const HARD_MAX_OPERATIONS = 10_000;

/** Create a workspace-confined filesystem adapter with a strict byte bound. */
export async function createWorkspaceFileAdapter({ workspaceRoot, maxFileBytes = DEFAULT_MAX_FILE_BYTES,
    maxFilesPerScan = DEFAULT_MAX_FILES_PER_SCAN, maxOperations = DEFAULT_MAX_OPERATIONS, onActivity = () => undefined }) {
    if (typeof workspaceRoot !== 'string' || workspaceRoot.trim() === ''
        || !Number.isInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > HARD_MAX_FILE_BYTES
        || !Number.isInteger(maxFilesPerScan) || maxFilesPerScan < 1 || maxFilesPerScan > HARD_MAX_FILES_PER_SCAN
        || !Number.isInteger(maxOperations) || maxOperations < 1 || maxOperations > HARD_MAX_OPERATIONS
        || typeof onActivity !== 'function') {
        throw new DomainInvariantError('invalid-workspace-file-options',
            'A workspace root and safe workspace file and scan limits are required.');
    }
    const root = await realpath(workspaceRoot);
    let operationCount = 0;
    const consumeOperation = () => {
        if (operationCount >= maxOperations) {
            throw new DomainInvariantError('workspace-operation-limit', 'Workspace operation budget has been exhausted.');
        }
        operationCount += 1;
    };

    return Object.freeze({
        listFiles: async () => {
            consumeOperation();
            const files = [];
            const pending = [''];
            while (pending.length > 0 && files.length < maxFilesPerScan) {
                const directory = pending.pop();
                const absoluteDirectory = directory ? resolveWorkspacePath(root, directory) : root;
                const entries = await readdir(absoluteDirectory, { withFileTypes: true });
                entries.sort((left, right) => left.name.localeCompare(right.name));
                for (const entry of entries) {
                    if (files.length >= maxFilesPerScan) break;
                    const relativePath = directory ? `${directory}/${entry.name}` : entry.name;
                    if (isSensitiveWorkspacePath(relativePath)) continue;
                    if (entry.isSymbolicLink()) continue;
                    if (entry.isDirectory()) pending.push(relativePath);
                    else if (entry.isFile()) files.push(relativePath);
                }
            }
            return Object.freeze({ files: Object.freeze(files), truncated: pending.length > 0 || files.length === maxFilesPerScan,
                limit: maxFilesPerScan });
        },
        readFile: async (path) => {
            consumeOperation();
            const target = resolveWorkspacePath(root, path);
            try {
                const canonical = await realpath(target);
                assertContained(root, canonical);
                const handle = await open(canonical, 'r');
                try {
                    const info = await handle.stat();
                    if (!info.isFile()) {
                        throw new DomainInvariantError('invalid-workspace-file-operation', 'Only regular workspace files can be read.');
                    }
                    assertWithinLimit(info.size, maxFileBytes);
                    const contents = await readBoundedFile(handle, maxFileBytes);
                    reportActivity(onActivity, { operation: 'read', path, bytes: contents.length, succeeded: true });
                    return contents.toString('utf8');
                }
                finally {
                    await handle.close();
                }
            }
            catch (error) {
                reportActivity(onActivity, { operation: 'read', path, bytes: 0, succeeded: false });
                throw error;
            }
        },
        writeFile: async (path, contents) => {
            consumeOperation();
            if (typeof contents !== 'string') {
                throw new DomainInvariantError('invalid-workspace-file-content', 'Workspace writes require string content.');
            }
            assertWithinLimit(Buffer.byteLength(contents, 'utf8'), maxFileBytes);
            const target = resolveWorkspacePath(root, path);
            const parent = await realpath(dirname(target));
            assertContained(root, parent);
            try {
                const info = await lstat(target);
                if (info.isSymbolicLink()) {
                    throw new DomainInvariantError('workspace-path-escape', 'Workspace writes cannot follow symbolic links.');
                }
            }
            catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
            try {
                await writeFile(target, contents, { encoding: 'utf8', flag: 'w' });
                reportActivity(onActivity, { operation: 'write', path, bytes: Buffer.byteLength(contents, 'utf8'), succeeded: true });
            }
            catch (error) {
                reportActivity(onActivity, { operation: 'write', path, bytes: 0, succeeded: false });
                throw error;
            }
        },
        createFile: async (path, contents) => {
            consumeOperation();
            if (typeof contents !== 'string') {
                throw new DomainInvariantError('invalid-workspace-file-content', 'Workspace writes require string content.');
            }
            const bytes = Buffer.byteLength(contents, 'utf8');
            assertWithinLimit(bytes, maxFileBytes);
            const target = resolveWorkspacePath(root, path);
            const parent = await realpath(dirname(target));
            assertContained(root, parent);
            try {
                await writeFile(target, contents, { encoding: 'utf8', flag: 'wx' });
                reportActivity(onActivity, { operation: 'create', path, bytes, succeeded: true });
            }
            catch (error) {
                reportActivity(onActivity, { operation: 'create', path, bytes: 0, succeeded: false });
                throw error;
            }
        },
        deleteFile: async (path) => {
            consumeOperation();
            const target = resolveWorkspacePath(root, path);
            let info;
            try { info = await lstat(target); }
            catch (error) {
                reportActivity(onActivity, { operation: 'delete', path, bytes: 0, succeeded: false });
                throw error;
            }
            if (info.isSymbolicLink() || !info.isFile()) {
                reportActivity(onActivity, { operation: 'delete', path, bytes: 0, succeeded: false });
                throw new DomainInvariantError('invalid-workspace-file-operation', 'Only regular workspace files can be deleted.');
            }
            const canonical = await realpath(target);
            assertContained(root, canonical);
            try {
                await unlink(canonical);
                reportActivity(onActivity, { operation: 'delete', path, bytes: info.size, succeeded: true });
            }
            catch (error) {
                reportActivity(onActivity, { operation: 'delete', path, bytes: 0, succeeded: false });
                throw error;
            }
        },
        renameFile: async (path, newPath) => {
            consumeOperation();
            let bytes = 0;
            try {
                const source = resolveWorkspacePath(root, path);
                const target = resolveWorkspacePath(root, newPath);
                const sourceInfo = await lstat(source);
                if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile()) {
                    throw new DomainInvariantError('invalid-workspace-file-operation', 'Only regular workspace files can be renamed.');
                }
                const canonicalSource = await realpath(source);
                assertContained(root, canonicalSource);
                const parent = await realpath(dirname(target));
                assertContained(root, parent);
                try {
                    await lstat(target);
                    throw new DomainInvariantError('workspace-file-already-exists', 'Rename cannot overwrite an existing workspace path.');
                }
                catch (error) {
                    if (error.code !== 'ENOENT') throw error;
                }
                bytes = sourceInfo.size;
                await rename(canonicalSource, target);
                reportActivity(onActivity, { operation: 'rename', path: `${path} -> ${newPath}`, bytes, succeeded: true });
            }
            catch (error) {
                reportActivity(onActivity, { operation: 'rename', path: `${path} -> ${newPath}`, bytes, succeeded: false });
                throw error;
            }
        },
    });
}

function reportActivity(observer, activity) {
    try {
        observer(Object.freeze({
            operation: activity.operation,
            path: activity.path.slice(0, 240),
            bytes: Math.min(activity.bytes, HARD_MAX_FILE_BYTES),
            succeeded: activity.succeeded,
        }));
    }
    catch {
        // Observability must never change the result of a workspace operation.
    }
}

function resolveWorkspacePath(root, path) {
    if (typeof path !== 'string' || path.trim() === '' || isAbsolute(path) || path.includes('\0') || path.includes(':')
        || hasWindowsPathAlias(path)) {
        throw new DomainInvariantError('invalid-workspace-path', 'Workspace paths must be non-empty relative paths.');
    }
    if (isSensitiveWorkspacePath(path)) {
        throw new DomainInvariantError('sensitive-workspace-file-forbidden', 'Workspace file operations cannot access common credential or private-key paths.');
    }
    const target = resolve(root, path);
    assertContained(root, target);
    return target;
}

function assertContained(root, target) {
    const rel = relative(root, target);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new DomainInvariantError('workspace-path-escape', 'Workspace path resolves outside the allowed root.');
    }
}

function assertWithinLimit(size, maximum) {
    if (size > maximum) {
        throw new DomainInvariantError('workspace-file-too-large', `File exceeds the ${maximum}-byte workspace limit.`);
    }
}

async function readBoundedFile(handle, maximum) {
    const chunks = [];
    let totalBytes = 0;
    while (true) {
        const capacity = Math.min(64 * 1024, maximum - totalBytes + 1);
        const buffer = Buffer.allocUnsafe(capacity);
        const { bytesRead } = await handle.read(buffer, 0, capacity, null);
        if (bytesRead === 0) break;
        totalBytes += bytesRead;
        assertWithinLimit(totalBytes, maximum);
        chunks.push(buffer.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, totalBytes);
}

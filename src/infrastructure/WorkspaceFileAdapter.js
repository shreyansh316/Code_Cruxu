import { lstat, open, realpath, readdir, writeFile } from 'fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'path';
import { DomainInvariantError } from '../domain/errors';

const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
const HARD_MAX_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES_PER_SCAN = 500;
const HARD_MAX_FILES_PER_SCAN = 5000;

/** Create a workspace-confined filesystem adapter with a strict byte bound. */
export async function createWorkspaceFileAdapter({ workspaceRoot, maxFileBytes = DEFAULT_MAX_FILE_BYTES,
    maxFilesPerScan = DEFAULT_MAX_FILES_PER_SCAN }) {
    if (typeof workspaceRoot !== 'string' || workspaceRoot.trim() === ''
        || !Number.isInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > HARD_MAX_FILE_BYTES
        || !Number.isInteger(maxFilesPerScan) || maxFilesPerScan < 1 || maxFilesPerScan > HARD_MAX_FILES_PER_SCAN) {
        throw new DomainInvariantError('invalid-workspace-file-options',
            'A workspace root and safe workspace file and scan limits are required.');
    }
    const root = await realpath(workspaceRoot);

    return Object.freeze({
        listFiles: async () => {
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
                    if (entry.isSymbolicLink()) continue;
                    if (entry.isDirectory()) pending.push(relativePath);
                    else if (entry.isFile()) files.push(relativePath);
                }
            }
            return Object.freeze({ files: Object.freeze(files), truncated: pending.length > 0 || files.length === maxFilesPerScan,
                limit: maxFilesPerScan });
        },
        readFile: async (path) => {
            const target = resolveWorkspacePath(root, path);
            const canonical = await realpath(target);
            assertContained(root, canonical);
            const handle = await open(canonical, 'r');
            try {
                const info = await handle.stat();
                assertWithinLimit(info.size, maxFileBytes);
                return (await handle.readFile()).toString('utf8');
            }
            finally {
                await handle.close();
            }
        },
        writeFile: async (path, contents) => {
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
            await writeFile(target, contents, { encoding: 'utf8', flag: 'w' });
        },
    });
}

function resolveWorkspacePath(root, path) {
    if (typeof path !== 'string' || path.trim() === '' || isAbsolute(path) || path.includes('\0')) {
        throw new DomainInvariantError('invalid-workspace-path', 'Workspace paths must be non-empty relative paths.');
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

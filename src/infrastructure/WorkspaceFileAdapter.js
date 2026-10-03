import { lstat, open, realpath, writeFile } from 'fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'path';
import { DomainInvariantError } from '../domain/errors';

const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
const HARD_MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Create a workspace-confined filesystem adapter with a strict byte bound. */
export async function createWorkspaceFileAdapter({ workspaceRoot, maxFileBytes = DEFAULT_MAX_FILE_BYTES }) {
    if (typeof workspaceRoot !== 'string' || workspaceRoot.trim() === ''
        || !Number.isInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > HARD_MAX_FILE_BYTES) {
        throw new DomainInvariantError('invalid-workspace-file-options',
            `A workspace root and maxFileBytes between 1 and ${HARD_MAX_FILE_BYTES} are required.`);
    }
    const root = await realpath(workspaceRoot);

    return Object.freeze({
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

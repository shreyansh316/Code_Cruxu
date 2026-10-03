import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { DomainInvariantError, createEntityId } from '../domain';

const MAX_PATHS = 5000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

/** Capture hashes and metadata for an explicit, bounded list of real workspace files. */
export async function createWorkspaceSnapshot({ workspaceRoot, snapshotId, paths } = {}) {
    if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim() || !Array.isArray(paths)
        || paths.length > MAX_PATHS) invalid();
    snapshotId = entityId(snapshotId);
    const root = await realpath(workspaceRoot);
    const normalized = paths.map(normalizeRelativePath);
    if (new Set(normalized).size !== normalized.length) invalid();
    let totalBytes = 0;
    const files = [];
    for (const path of normalized.sort()) {
        const target = resolve(root, path);
        assertContained(root, target);
        let info;
        try { info = await lstat(target); }
        catch (error) {
            if (error.code !== 'ENOENT') throw error;
            files.push(Object.freeze({ path, exists: false, size: 0, sha256: null }));
            continue;
        }
        if (info.isSymbolicLink() || !info.isFile() || info.size > MAX_FILE_BYTES) {
            throw new DomainInvariantError('invalid-workspace-snapshot-file', 'Snapshots accept only bounded regular files without symbolic links.');
        }
        const canonical = await realpath(target);
        assertContained(root, canonical);
        const content = await readFile(canonical);
        if (content.byteLength !== info.size) throw new DomainInvariantError('workspace-snapshot-race', 'Workspace file changed while its snapshot was captured.');
        totalBytes += content.byteLength;
        if (totalBytes > MAX_TOTAL_BYTES) throw new DomainInvariantError('workspace-snapshot-limit', 'Snapshot contents exceed the total byte limit.');
        files.push(Object.freeze({ path, exists: true, size: info.size,
            sha256: createHash('sha256').update(content).digest('hex') }));
    }
    return Object.freeze({ snapshotId, workspaceRoot: root, files: Object.freeze(files), totalBytes });
}

/** Compare two snapshots and recognize unambiguous content-preserving renames. */
export function compareWorkspaceSnapshots(before, after) {
    if (!validSnapshot(before) || !validSnapshot(after) || before.workspaceRoot !== after.workspaceRoot) invalid();
    const prior = new Map(before.files.map((file) => [file.path, file]));
    const current = new Map(after.files.map((file) => [file.path, file]));
    const added = [...current.values()].filter((file) => file.exists && !prior.get(file.path)?.exists);
    const deleted = [...prior.values()].filter((file) => file.exists && !current.get(file.path)?.exists);
    const modified = [];
    for (const [path, next] of current) {
        const previous = prior.get(path);
        if (next.exists && previous?.exists && next.sha256 !== previous.sha256) modified.push(Object.freeze({ path, before: previous, after: next }));
    }
    const renames = [];
    const consumedAdded = new Set();
    const consumedDeleted = new Set();
    for (const oldFile of deleted) {
        const matches = added.filter((newFile) => newFile.sha256 === oldFile.sha256);
        if (matches.length === 1 && deleted.filter((candidate) => candidate.sha256 === oldFile.sha256).length === 1) {
            const replacement = matches[0];
            consumedDeleted.add(oldFile.path);
            consumedAdded.add(replacement.path);
            renames.push(Object.freeze({ from: oldFile.path, to: replacement.path, sha256: oldFile.sha256 }));
        }
    }
    return Object.freeze({ added: Object.freeze(added.filter(({ path }) => !consumedAdded.has(path))),
        deleted: Object.freeze(deleted.filter(({ path }) => !consumedDeleted.has(path))),
        modified: Object.freeze(modified), renamed: Object.freeze(renames) });
}

function validSnapshot(value) {
    return value && typeof value === 'object' && typeof value.snapshotId === 'string'
        && typeof value.workspaceRoot === 'string' && Array.isArray(value.files)
        && value.files.length <= MAX_PATHS && value.files.every((file) => file && typeof file.path === 'string'
            && typeof file.exists === 'boolean' && (file.exists
                ? Number.isSafeInteger(file.size) && file.size >= 0 && /^[a-f0-9]{64}$/.test(file.sha256)
                : file.size === 0 && file.sha256 === null));
}
function normalizeRelativePath(path) {
    if (typeof path !== 'string' || !path.trim() || path.includes('\0') || isAbsolute(path)
        || path.split(/[\\/]/).some((part) => !part || part === '.' || part === '..')) invalid();
    return path.replaceAll('\\', '/');
}
function assertContained(root, target) {
    const rel = relative(root, target);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new DomainInvariantError('workspace-path-escape', 'Snapshot paths must remain inside the workspace.');
    }
}
function entityId(value) {
    try { return createEntityId(value); }
    catch { invalid(); }
}
function invalid() {
    throw new DomainInvariantError('invalid-workspace-snapshot', 'Workspace snapshot request or data is malformed or exceeds its bounds.');
}

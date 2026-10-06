import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';

/** Hash the canonical workspace path so task grants cannot silently move to another folder. */
export async function createWorkspaceFingerprint(workspaceRoot) {
    if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim()) throw new TypeError('Workspace root is required.');
    const canonicalRoot = await realpath(workspaceRoot);
    return createHash('sha256').update(canonicalRoot.toLocaleLowerCase('en-US')).digest('hex');
}

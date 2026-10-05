/** Phase 201 — bounded workspace file activity. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createWorkspaceFileAdapter } from '../src/infrastructure';

const temporaryDirectories = [];
async function temporaryDirectory() {
    const path = await mkdtemp(join(tmpdir(), 'headroom-activity-'));
    temporaryDirectories.push(path);
    return path;
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('Phase 201 — workspace activity observation', () => {
    it('reports bounded file operation metadata without exposing file contents', async () => {
        const root = await temporaryDirectory();
        const onActivity = vi.fn();
        const adapter = await createWorkspaceFileAdapter({ workspaceRoot: root, onActivity });
        const secret = 'api_key=private-value';

        await adapter.writeFile('example.js', secret);
        expect(await adapter.readFile('example.js')).toBe(secret);

        expect(onActivity.mock.calls.map(([event]) => event)).toEqual([
            { operation: 'write', path: 'example.js', bytes: Buffer.byteLength(secret), succeeded: true },
            { operation: 'read', path: 'example.js', bytes: Buffer.byteLength(secret), succeeded: true },
        ]);
        expect(JSON.stringify(onActivity.mock.calls)).not.toContain(secret);
        expect(await readFile(join(root, 'example.js'), 'utf8')).toBe(secret);
    });

    it('reports failed operations without changing their errors and isolates observer failures', async () => {
        const root = await temporaryDirectory();
        const events = [];
        const adapter = await createWorkspaceFileAdapter({ workspaceRoot: root, onActivity: (event) => events.push(event) });
        await expect(adapter.readFile('missing.txt')).rejects.toThrow();
        expect(events).toEqual([{ operation: 'read', path: 'missing.txt', bytes: 0, succeeded: false }]);

        const observerFailure = await createWorkspaceFileAdapter({ workspaceRoot: root, onActivity: () => { throw new Error('observer'); } });
        await expect(observerFailure.writeFile('ok.txt', 'ok')).resolves.toBeUndefined();
    });

    it('validates the observer boundary', async () => {
        const root = await temporaryDirectory();
        await expect(createWorkspaceFileAdapter({ workspaceRoot: root, onActivity: true })).rejects.toThrow(/limits/);
    });
});

import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIGURATION_DEFAULTS, validateHeadroomConfiguration } from '../src/core/Configuration';
import { createWorkspaceFileAdapter } from '../src/infrastructure/WorkspaceFileAdapter';

const roots = [];
function makeRoot() {
    const root = mkdtempSync(join(tmpdir(), 'headroom-081-'));
    roots.push(root);
    return root;
}

describe('Phase 081 — large-workspace execution limits', () => {
    afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

    it('validates configurable scan, file, process, concurrency, and context limits', () => {
        const values = {
            'workspace.maxFilesPerScan': 2,
            'workspace.maxFileBytes': 2048,
            'execution.maxProcessOutputBytes': 4096,
            'execution.parallelLimit': 3,
            'context.maxBytes': 8192,
        };
        const result = validateHeadroomConfiguration({ get: (key) => values[key] });
        expect(result.configuration).toMatchObject({ maxWorkspaceFilesPerScan: 2, maxWorkspaceFileBytes: 2048,
            maxProcessOutputBytes: 4096, parallelLimit: 3, maxAgentContextBytes: 8192 });
        expect(result.diagnostics).toEqual([]);
        const invalid = validateHeadroomConfiguration({ get: (key) => key === 'workspace.maxFilesPerScan' ? 5001 : undefined });
        expect(invalid.configuration.maxWorkspaceFilesPerScan).toBe(CONFIGURATION_DEFAULTS.maxWorkspaceFilesPerScan);
        expect(invalid.diagnostics[0]).toMatchObject({ setting: 'headroom.workspace.maxFilesPerScan', code: 'out-of-range' });
    });

    it('scans deterministic workspace-relative files and reports a bounded truncation', async () => {
        const root = makeRoot();
        mkdirSync(join(root, 'nested'));
        for (const name of ['a.txt', 'b.txt', 'nested/c.txt', 'nested/d.txt']) writeFileSync(join(root, name), name);
        try { symlinkSync(root, join(root, 'escape'), 'junction'); } catch { /* Symlink creation may be unavailable on the host. */ }
        const adapter = await createWorkspaceFileAdapter({ workspaceRoot: root, maxFilesPerScan: 2 });
        const result = await adapter.listFiles();
        expect(result.files).toEqual(['a.txt', 'b.txt']);
        expect(result).toMatchObject({ truncated: true, limit: 2 });
        expect(result.files.every((path) => !path.startsWith('..') && !path.includes('\\'))).toBe(true);
    });

    it('rejects unsafe scan and file bounds', async () => {
        const root = makeRoot();
        await expect(createWorkspaceFileAdapter({ workspaceRoot: root, maxFilesPerScan: 5001 }))
            .rejects.toMatchObject({ code: 'invalid-workspace-file-options' });
        await expect(createWorkspaceFileAdapter({ workspaceRoot: root, maxFileBytes: 10 * 1024 * 1024 + 1 }))
            .rejects.toMatchObject({ code: 'invalid-workspace-file-options' });
    });
});

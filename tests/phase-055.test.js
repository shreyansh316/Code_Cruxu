import { mkdtemp, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTaskScopedTools } from '../src/infrastructure/TaskScopedTools';

describe('Phase 055 — task-scoped tool authorization', () => {
    let root; let calls; let tools;
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'headroom-055-'));
        await mkdir(join(root, 'src'));
        calls = [];
        tools = await createTaskScopedTools({ workspaceRoot: root,
            filesystem: { readFile: async (path) => { calls.push(['read', path]); return 'ok'; },
                writeFile: async (path) => calls.push(['write', path]) },
            processRunner: { execute: async (request) => { calls.push(['process', request]); return { exitCode: 0 }; } },
            permissions: { readFiles: ['src/input.js'], writeFiles: ['src/output.js'],
                commands: [{ command: process.execPath, args: ['--version'] }] } });
    });
    afterEach(async () => rm(root, { recursive: true, force: true }));
    it('allows only exact task file paths and command plus argument grants', async () => {
        await tools.filesystem.readFile('src/input.js');
        await tools.filesystem.writeFile('src/output.js', 'result');
        await tools.process.execute({ command: process.execPath, args: ['--version'], cwd: root });
        expect(calls).toHaveLength(3);
    });
    it('rejects ungranted paths, path traversal, changed command arguments, and outside cwd', async () => {
        await expect(tools.filesystem.readFile('src/other.js')).rejects.toMatchObject({ code: 'task-tool-not-authorized' });
        expect(() => tools.filesystem.writeFile('../outside.js', 'x')).toThrow(/permission manifest is malformed/i);
        await expect(tools.process.execute({ command: process.execPath, args: ['-e', 'bad'] })).rejects.toMatchObject({ code: 'task-tool-not-authorized' });
        await expect(tools.process.execute({ command: process.execPath, args: ['--version'], cwd: tmpdir() })).rejects.toMatchObject({ code: 'task-tool-not-authorized' });
        expect(calls).toHaveLength(0);
    });
});

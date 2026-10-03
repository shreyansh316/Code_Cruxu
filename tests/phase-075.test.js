import { describe, expect, it } from 'vitest';
import { createCommandRunner } from '../src/infrastructure/CommandRunner';
import { createTaskScopedTools } from '../src/infrastructure/TaskScopedTools';

describe('Phase 075 — tool boundary hardening', () => {
    it('rejects shell interpreters from the allowlist', () => {
        expect(() => createCommandRunner({ allowedCommands: ['C:\\Windows\\System32\\cmd.exe'] }))
            .toThrow(/Shell interpreters cannot be added/);
        expect(() => createCommandRunner({ allowedCommands: ['/bin/bash'] })).toThrow(/Shell interpreters cannot be added/);
    });

    it('bounds argument count and total bytes before spawning a process', async () => {
        const runner = createCommandRunner({ allowedCommands: [process.execPath] });
        await expect(runner.execute({ command: process.execPath, args: Array(101).fill('x') }))
            .rejects.toMatchObject({ code: 'invalid-command-arguments' });
        await expect(runner.execute({ command: process.execPath, args: ['x'.repeat(2049)] }))
            .rejects.toMatchObject({ code: 'invalid-command-arguments' });
        await expect(runner.execute({ command: process.execPath, args: Array(40).fill('x'.repeat(1800)) }))
            .rejects.toMatchObject({ code: 'invalid-command-arguments' });
    });

    it('rejects shell grants and oversized task permission packets before exposing tools', async () => {
        await expect(createTaskScopedTools({ workspaceRoot: process.cwd(), filesystem: { readFile() {}, writeFile() {} },
            processRunner: { execute() {} }, permissions: { readFiles: [], writeFiles: [],
                commands: [{ command: 'powershell.exe', args: ['-Command', 'echo unsafe'] }] } }))
            .rejects.toMatchObject({ code: 'command-shell-not-allowed' });
        await expect(createTaskScopedTools({ workspaceRoot: process.cwd(), filesystem: { readFile() {}, writeFile() {} },
            processRunner: { execute() {} }, permissions: { readFiles: [], writeFiles: [],
                commands: [{ command: process.execPath, args: ['x'.repeat(2049)] }] } }))
            .rejects.toMatchObject({ code: 'invalid-command-arguments' });
    });
});

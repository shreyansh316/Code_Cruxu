/** Phase 324 — prevent Win32 trailing-dot/space aliases from bypassing shell denial. */
import { describe, expect, it } from 'vitest';
import { createCommandRunner, createTaskScopedTools } from '../src/infrastructure';

describe('Phase 324 — normalized shell executable denylist', () => {
    it.each([
        'C:\\Windows\\System32\\cmd.exe.',
        'C:\\Windows\\System32\\cmd.exe ',
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe..',
        'C:\\Program Files\\PowerShell\\7\\pwsh.exe .',
        '/bin/bash ',
    ])('rejects shell path aliases before allowlist creation (%s)', (command) => {
        expect(() => createCommandRunner({ allowedCommands: [command] })).toThrow(/cannot be added/i);
    });

    it('rejects shell aliases in task grants as well as global command allowlists', async () => {
        await expect(createTaskScopedTools({ workspaceRoot: process.cwd(),
            filesystem: { readFile() {}, writeFile() {} }, processRunner: { execute() {} },
            permissions: { readFiles: [], writeFiles: [], commands: [
                { command: 'C:\\Windows\\System32\\cmd.exe.', args: ['/c', 'echo unsafe'] },
            ] } })).rejects.toMatchObject({ code: 'command-shell-not-allowed' });
    });
});

/** Phase 091 — adversarial regressions across HEADROOM trust boundaries. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AgentRole } from '../src/constants';
import { getPromptContract, validateStructuredAIOutput, createHierarchyMessageRouter,
    createAIProviderRequest, createAIProviderPort } from '../src/application';
import { createWorkspaceFileAdapter, createTaskScopedTools, createGeminiAIProviderAdapter } from '../src/infrastructure';

const temporaryDirectories = [];
async function temporaryDirectory() {
    const directory = await mkdtemp(join(tmpdir(), 'headroom-security-'));
    temporaryDirectories.push(directory);
    return directory;
}

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('Phase 091 — security regression suite', () => {
    it('blocks traversal and workspace symlink escapes for reads and writes', async () => {
        const root = await temporaryDirectory();
        const outside = await temporaryDirectory();
        await writeFile(join(outside, 'secret.txt'), 'private');
        await symlink(outside, join(root, 'external'), 'junction');
        const files = await createWorkspaceFileAdapter({ workspaceRoot: root });

        await expect(files.readFile('../secret.txt')).rejects.toThrow();
        await expect(files.readFile('external/secret.txt')).rejects.toThrow(/outside/);
        await expect(files.writeFile('external/new.txt', 'escape')).rejects.toThrow(/outside/);
        await expect(files.writeFile('../outside.txt', 'escape')).rejects.toThrow();
    });

    it('does not let a task alter its exact command grant with shell syntax', async () => {
        const root = await temporaryDirectory();
        const execute = vi.fn(async () => ({ exitCode: 0 }));
        const tools = await createTaskScopedTools({ workspaceRoot: root,
            filesystem: { readFile: vi.fn(), writeFile: vi.fn() }, processRunner: { execute },
            permissions: { readFiles: [], writeFiles: [], commands: [{ command: process.execPath, args: ['--version'] }] } });

        await expect(tools.process.execute({ command: process.execPath,
            args: ['--version; write-file ../../outside'], cwd: root })).rejects.toMatchObject({ code: 'task-tool-not-authorized' });
        expect(execute).not.toHaveBeenCalled();
    });

    it('keeps approval claims outside the Director proposal contract', () => {
        const contract = getPromptContract('director.plan-proposal.v1');
        expect(contract.systemPrompt).toMatch(/Do not approve, activate, or claim authorization/i);
        const proposal = { projects: [{ name: 'Build' }], milestones: [{ projectIndex: 0, title: 'Ship' }],
            tasks: [{ projectIndex: 0, milestoneIndex: 0, title: 'Implement', acceptanceCriteria: ['Works'] }],
            dependencies: [] };
        expect(validateStructuredAIOutput(proposal, contract.outputSchema)).toEqual(proposal);
        expect(() => validateStructuredAIOutput({ ...proposal, approved: true }, contract.outputSchema))
            .toThrow(/did not match/);
    });

    it('does not expose provider credentials or raw network errors in results', async () => {
        const credential = 'security-regression-secret-value';
        const adapter = createGeminiAIProviderAdapter({ credentialStore: { getCredential: async () => credential },
            fetchImpl: async (_url, options) => {
                expect(options.headers['x-goog-api-key']).toBe(credential);
                throw new Error(`network failed with ${credential}`);
            } });
        const request = createAIProviderRequest({ requestId: 'phase-091-request', model: 'test-model',
            systemPrompt: 'Return JSON.', input: {}, outputSchema: { type: 'object' } });
        const result = await createAIProviderPort(adapter).generate(request);

        expect(result).toMatchObject({ finishReason: 'ERROR', errorCode: 'provider-network-error' });
        expect(JSON.stringify(result)).not.toContain(credential);
    });

    it('rejects a hierarchy route forged across office boundaries', async () => {
        const hierarchy = { organization: { id: 'org-091', name: 'Org' },
            offices: [
                { id: 'office-a-091', organizationId: 'org-091', name: 'A', slug: 'a', status: 'ACTIVE' },
                { id: 'office-b-091', organizationId: 'org-091', name: 'B', slug: 'b', status: 'ACTIVE' },
            ],
            departments: [
                { id: 'department-a-091', officeId: 'office-a-091', name: 'A', slug: 'a', status: 'ACTIVE' },
                { id: 'department-b-091', officeId: 'office-b-091', name: 'B', slug: 'b', status: 'ACTIVE' },
            ],
            agents: [
                { id: 'director-091', name: 'Director', role: AgentRole.DIRECTOR, status: 'IDLE' },
                { id: 'head-a-091', name: 'Head A', role: AgentRole.HEAD_MANAGER, managedOfficeId: 'office-a-091', status: 'IDLE' },
                { id: 'manager-b-091', name: 'Manager B', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'department-b-091', status: 'IDLE' },
            ] };
        const router = createHierarchyMessageRouter({ hierarchyProvider: { getSnapshot: () => hierarchy } });

        const result = await router.run({ senderId: 'head-a-091', recipientId: 'manager-b-091', message: 'assign task' });
        expect(result).toMatchObject({ ok: false, error: { code: 'hierarchy-route-forbidden' } });
    });
});

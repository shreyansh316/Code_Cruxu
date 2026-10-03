/** Phase 045 — provider credentials use VS Code SecretStorage only. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as vscode from 'vscode';
import { createProviderCredentialUseCases } from '../src/application';
import { COMMANDS } from '../src/constants';
import { HeadroomContext } from '../src/core/HeadroomContext';
import { createSecretStorageAdapter } from '../src/infrastructure';

const temporaryDirectories = [];

function makeSecretStorage() {
    const values = new Map();
    return {
        values,
        get: vi.fn(async (key) => values.get(key)),
        store: vi.fn(async (key, value) => { values.set(key, value); }),
        delete: vi.fn(async (key) => { values.delete(key); }),
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Phase 045 — secure provider credentials', () => {
    it('stores bounded credentials using fixed provider-scoped SecretStorage keys', async () => {
        const secrets = makeSecretStorage();
        const adapter = createSecretStorageAdapter(secrets);
        expect(await adapter.storeCredential('gemini', '  test credential value  ')).toEqual({ provider: 'gemini', configured: true });
        expect(secrets.store).toHaveBeenCalledWith('headroom.ai.credentials.gemini', 'test credential value');
        expect(await adapter.getCredential('gemini')).toBe('test credential value');
        expect(await adapter.hasCredential('gemini')).toBe(true);
        expect(await adapter.deleteCredential('gemini')).toEqual({ provider: 'gemini', configured: false });
        expect(await adapter.hasCredential('gemini')).toBe(false);
        await expect(adapter.storeCredential('unknown', 'secret')).rejects.toThrow(/configured AI providers/);
        await expect(adapter.storeCredential('openai', 'line one\nline two')).rejects.toThrow(/single-line/);
    });

    it('offers set, clear, and presence use cases that never return secret material', async () => {
        const adapter = createSecretStorageAdapter(makeSecretStorage());
        const credentials = createProviderCredentialUseCases({ credentialStore: adapter });
        const stored = await credentials.set.run({ provider: 'openai', credential: 'test credential value' });
        expect(stored).toEqual({ ok: true, value: { provider: 'openai', configured: true } });
        expect(JSON.stringify(stored)).not.toContain('test credential value');
        expect(await credentials.status.run({ provider: 'openai' })).toEqual({
            ok: true, value: { provider: 'openai', configured: true },
        });
        expect((await credentials.set.run({ provider: 'mock', credential: 'secret' })).error.code)
            .toBe('unsupported-ai-provider');
        expect(await credentials.clear.run({ provider: 'openai' })).toEqual({
            ok: true, value: { provider: 'openai', configured: false },
        });
    });

    it('keeps credentials out of contributed settings and exposes setup commands', () => {
        const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
        const settingNames = Object.keys(manifest.contributes.configuration.properties).join(' ').toLowerCase();
        expect(settingNames).not.toMatch(/api.?key|credential|secret/);
        const commandIds = manifest.contributes.commands.map(({ command }) => command);
        expect(commandIds).toContain(COMMANDS.CONFIGURE_PROVIDER_CREDENTIAL);
        expect(commandIds).toContain(COMMANDS.CLEAR_PROVIDER_CREDENTIAL);
    });

    it('captures credentials through a password input and persists only through SecretStorage', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'headroom-phase045-'));
        temporaryDirectories.push(directory);
        const handlers = new Map();
        vi.mocked(vscode.commands.registerCommand).mockImplementation((command, handler) => {
            handlers.set(command, handler);
            return { dispose: vi.fn() };
        });
        const configuration = { get: (key) => key === 'ai.provider' ? 'mock' : undefined, update: vi.fn() };
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(configuration);
        vi.mocked(vscode.window.registerTreeDataProvider).mockReturnValue({ dispose: vi.fn() });
        vi.mocked(vscode.window.createStatusBarItem).mockReturnValue({
            name: '', text: '', tooltip: '', command: '', show: vi.fn(), hide: vi.fn(), dispose: vi.fn(),
        });
        vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ provider: 'openai' });
        vi.mocked(vscode.window.showInputBox).mockResolvedValue('test credential value');
        const secrets = makeSecretStorage();
        const context = new HeadroomContext({
            subscriptions: [], globalState: { get: () => true, update: vi.fn() },
            globalStorageUri: { fsPath: directory }, secrets,
        });
        try {
            await context.initialize();
            await handlers.get(COMMANDS.CONFIGURE_PROVIDER_CREDENTIAL)();
            expect(vscode.window.showInputBox).toHaveBeenCalledWith(expect.objectContaining({ password: true }));
            expect(secrets.values.get('headroom.ai.credentials.openai')).toBe('test credential value');
            expect(configuration.update).not.toHaveBeenCalled();
            const shownMessages = vi.mocked(vscode.window.showInformationMessage).mock.calls.flat().join(' ');
            expect(shownMessages).not.toContain('test credential value');
            await handlers.get(COMMANDS.CLEAR_PROVIDER_CREDENTIAL)();
            expect(secrets.values.has('headroom.ai.credentials.openai')).toBe(false);
        }
        finally {
            context.dispose();
        }
    });
});

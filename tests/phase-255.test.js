/** Phase 255 — expose consent-based selected-code engineering review in VS Code. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { HeadroomContext } from '../src/core/HeadroomContext';

afterEach(() => { delete vscode.window.activeTextEditor; });

describe('Phase 255 — review selected code command flow', () => {
    it('requires consent, redacts source credentials, and opens only validated review output', async () => {
        const secret = 'ghp_123456789012345678901234567890123456';
        vscode.window.activeTextEditor = { selection: {}, document: {
            fileName: 'C:\\repo\\service.js', getText: () => `const api_key = '${secret}';`,
        } };
        vscode.window.showWarningMessage.mockResolvedValue('Send selection');
        let request;
        const context = new HeadroomContext({});
        context._databaseConnection = { database: {} };
        context._configuration = { aiProvider: 'gemini', reasoningModel: 'review-model' };
        context._beginDirectorRequest = vi.fn(() => new AbortController());
        context._createDirectorProvider = vi.fn(() => ({ generate: async (value) => {
            request = value;
            return { finishReason: 'STOP', usage: { inputTokens: 25, outputTokens: 40 }, output: {
                findings: [], speculations: [], confidence: 'UNASSESSED',
            } };
        } }));
        vscode.workspace.openTextDocument.mockResolvedValue({ languageId: 'json' });

        await context._reviewSelection('SECURITY');

        expect(request.input).not.toContain(secret);
        expect(request.systemPrompt).toContain('concrete defect');
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('Common credential patterns are redacted first.'),
            { modal: true }, 'Send selection');
        expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(expect.objectContaining({ language: 'json' }));
        expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it('does not call an AI provider without selected source text', async () => {
        vscode.window.activeTextEditor = { selection: {}, document: { getText: () => '' } };
        const context = new HeadroomContext({});
        context._createDirectorProvider = vi.fn();
        await context._reviewSelection();
        expect(context._createDirectorProvider).not.toHaveBeenCalled();
    });
});

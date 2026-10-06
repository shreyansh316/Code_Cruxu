/** Phase 231 — expose evidence-backed explanation for an explicitly selected editor range. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { HeadroomContext } from '../src/core/HeadroomContext';

afterEach(() => { delete vscode.window.activeTextEditor; });

describe('Phase 231 — explain selected code command flow', () => {
    it('asks before provider handoff, redacts credential patterns, then opens the cited result', async () => {
        const token = 'ghp_123456789012345678901234567890123456';
        vscode.window.activeTextEditor = {
            selection: {}, document: { fileName: 'C:\\repo\\source.js', getText: () => `const api_key = '${token}';` },
        };
        vscode.window.showQuickPick.mockResolvedValue({ action: 'EXPLAIN_FILE' });
        vscode.window.showWarningMessage.mockResolvedValue('Send selection');
        const response = { CHANGE: [], WHY: [{ text: 'Credential assignment appears in the selected code.', source: 'RECONSTRUCTED_DECISION', evidenceIds: ['active-selection'] }],
            REQUIREMENT: [], CONTEXT: [], ALTERNATIVES: [], REJECTED_OPTIONS: [], TRADE_OFFS: [], RISKS: [], TESTS: [], confidence: 'UNASSESSED' };
        let sentRequest;
        const context = new HeadroomContext({});
        context._databaseConnection = { database: {} };
        context._configuration = { aiProvider: 'gemini', reasoningModel: 'test-model' };
        context._beginDirectorRequest = vi.fn(() => new AbortController());
        context._createDirectorProvider = vi.fn(() => ({ generate: async (request) => {
            sentRequest = request;
            return { finishReason: 'STOP', output: response, usage: { inputTokens: 30, outputTokens: 20 } };
        } }));
        vscode.workspace.openTextDocument.mockResolvedValue({ languageId: 'json' });

        await context._explainSelection();

        expect(vscode.window.showQuickPick).toHaveBeenCalledOnce();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('Common credential patterns are redacted first.'),
            { modal: true }, 'Send selection');
        expect(sentRequest.systemPrompt).toContain('evidence IDs');
        expect(sentRequest.input).not.toContain(token);
        expect(sentRequest.input).toContain('[redacted]');
        expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(expect.objectContaining({ language: 'json' }));
        expect(vscode.window.showTextDocument).toHaveBeenCalled();
    });

    it('does not request provider access when no selection exists', async () => {
        vscode.window.activeTextEditor = { selection: {}, document: { getText: () => '' } };
        const context = new HeadroomContext({});
        context._createDirectorProvider = vi.fn();
        await context._explainSelection();
        expect(context._createDirectorProvider).not.toHaveBeenCalled();
    });
});

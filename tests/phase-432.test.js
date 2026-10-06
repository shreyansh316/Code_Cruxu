/** Phase 432 — the VS Code explainability command exposes each contract-supported user intent. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CODE_EXPLANATION_ACTIONS } from '../src/domain';
import { chooseCodeExplanationAction } from '../src/core/CodeExplanationCommands';

describe('Phase 432 — selectable code explanation actions', () => {
    afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

    it('presents all supported intents and returns only the selected contract action', async () => {
        vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items) =>
            items.find((item) => item.action === 'WHY_NOT_THAT'));
        await expect(chooseCodeExplanationAction()).resolves.toBe('WHY_NOT_THAT');
        const [items, options] = vscode.window.showQuickPick.mock.calls[0];
        expect(items.map(({ action }) => action)).toEqual(CODE_EXPLANATION_ACTIONS);
        expect(items.map(({ label }) => label)).toContain('Review security');
        expect(items.map(({ label }) => label)).toContain('Make it simpler');
        expect(options.title).toContain('evidence-backed');
    });

    it('treats picker cancellation or an unsupported item as cancellation', async () => {
        vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({ action: 'UNSUPPORTED' });
        await expect(chooseCodeExplanationAction()).resolves.toBeUndefined();
        vscode.window.showQuickPick.mockResolvedValue(undefined);
        await expect(chooseCodeExplanationAction()).resolves.toBeUndefined();
    });
});

import * as vscode from 'vscode';
import { createWorkspaceFingerprint } from '../shared/workspaceFingerprint';

/** Require exactly one open workspace folder and fingerprint it safely.
 * Returns { root, fingerprint }, or null after showing the matching error.
 * Extracted from the task-execution and administration command flows (phase 461)
 * so the single-workspace rule and its messaging live in one place. */
export async function requireSingleWorkspaceFingerprint({ purpose } = {}) {
    if (typeof purpose !== 'string' || !purpose.trim()) {
        throw new TypeError('A purpose phrase is required for workspace guidance messages.');
    }
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length !== 1 || typeof folders[0]?.uri?.fsPath !== 'string') {
        vscode.window.showErrorMessage(`Open exactly one workspace folder before ${purpose.trim()}.`);
        return null;
    }
    try {
        const root = folders[0].uri.fsPath;
        return { root, name: folders[0].name, fingerprint: await createWorkspaceFingerprint(root) };
    } catch {
        vscode.window.showErrorMessage('The active workspace could not be identified safely.');
        return null;
    }
}

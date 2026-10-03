/**
 * HEADROOM — AI CEO Office VS Code Extension
 * Phase 001: Extension Entry Point
 *
 * This is the extension host entry point.
 * Responsibilities:
 * - Register all commands
 * - Initialize providers (tree views, webview)
 * - Bootstrap core services (database, event bus)
 * - Set up status bar
 *
 * PRINCIPLE: Activate once, then let events drive behavior.
 */
import * as vscode from 'vscode';
import { HeadroomContext } from './core/HeadroomContext';
// Extension-level singleton — initialized on activate, disposed on deactivate
let headroomContext;
let activationPromise;
export function activate(context) {
    if (activationPromise) return activationPromise;
    console.log('[HEADROOM] Activating...');
    const instance = new HeadroomContext(context);
    headroomContext = instance;
    activationPromise = instance.initialize().then(() => {
        console.log('[HEADROOM] Activated successfully.');
    }).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[HEADROOM] Activation failed:', message);
        vscode.window.showErrorMessage(`HEADROOM failed to activate: ${message}`);
        if (headroomContext === instance) headroomContext = undefined;
    }).finally(() => {
        activationPromise = undefined;
    });
    return activationPromise;
}
export function deactivate() {
    console.log('[HEADROOM] Deactivating...');
    try { headroomContext?.dispose(); }
    finally {
        headroomContext = undefined;
        activationPromise = undefined;
    }
}

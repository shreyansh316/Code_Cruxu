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
let headroomContext: HeadroomContext | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[HEADROOM] Activating...');

  try {
    // Initialize the core application context
    headroomContext = new HeadroomContext(context);
    await headroomContext.initialize();

    console.log('[HEADROOM] Activated successfully.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[HEADROOM] Activation failed:', message);
    vscode.window.showErrorMessage(`HEADROOM failed to activate: ${message}`);
  }
}

export function deactivate(): void {
  console.log('[HEADROOM] Deactivating...');
  headroomContext?.dispose();
  headroomContext = undefined;
}

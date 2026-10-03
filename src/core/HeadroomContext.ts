/**
 * HEADROOM — Core Application Context
 * Phase 001: Bootstrap and lifecycle management
 *
 * HeadroomContext owns:
 * - VS Code extension context (subscriptions, storage)
 * - Service initialization order
 * - Command registration
 * - Disposable cleanup
 *
 * All services are registered here and injected where needed.
 * This file must remain the single source of initialization order.
 */
import * as vscode from 'vscode';
import { COMMANDS } from '../constants';

export class HeadroomContext implements vscode.Disposable {
  private readonly _context: vscode.ExtensionContext;
  private readonly _disposables: vscode.Disposable[] = [];
  private _statusBarItem: vscode.StatusBarItem | undefined;
  private _initialized = false;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
  }

  async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    // 1. Register commands
    this._registerCommands();

    // 2. Set up status bar
    this._setupStatusBar();

    // 3. Mark initialized
    this._initialized = true;

    // Show welcome message on first activation
    const isFirstActivation = !this._context.globalState.get<boolean>('headroom.activated');
    if (isFirstActivation) {
      await this._context.globalState.update('headroom.activated', true);
      vscode.window.showInformationMessage(
        'HEADROOM is active. Open the CEO Dashboard to get started.',
        'Open Dashboard'
      ).then(selection => {
        if (selection === 'Open Dashboard') {
          vscode.commands.executeCommand(COMMANDS.OPEN_DASHBOARD);
        }
      });
    }
  }

  private _registerCommands(): void {
    this._disposables.push(
      vscode.commands.registerCommand(COMMANDS.OPEN_DASHBOARD, () => {
        // Phase 015: WebviewPanel implementation
        vscode.window.showInformationMessage('HEADROOM: CEO Dashboard — Phase 015');
      }),

      vscode.commands.registerCommand(COMMANDS.NEW_OBJECTIVE, () => {
        // Phase 052: Objective creation UI
        vscode.window.showInformationMessage('HEADROOM: New Objective — Phase 052');
      }),

      vscode.commands.registerCommand(COMMANDS.SHOW_STATUS, () => {
        this._showStatus();
      }),

      vscode.commands.registerCommand(COMMANDS.PAUSE_EXECUTION, () => {
        // Phase 013: Execution control
        vscode.window.showWarningMessage('HEADROOM: Execution paused.');
      }),

      vscode.commands.registerCommand(COMMANDS.RESUME_EXECUTION, () => {
        // Phase 013: Execution control
        vscode.window.showInformationMessage('HEADROOM: Execution resumed.');
      }),
    );

    // Register all disposables with extension context
    this._context.subscriptions.push(...this._disposables);
  }

  private _setupStatusBar(): void {
    this._statusBarItem = vscode.window.createStatusBarItem(
      'headroom.status',
      vscode.StatusBarAlignment.Left,
      100
    );
    this._statusBarItem.name = 'HEADROOM Status';
    this._statusBarItem.text = '$(circuit-board) HEADROOM';
    this._statusBarItem.tooltip = 'HEADROOM AI CEO Office — Click to open dashboard';
    this._statusBarItem.command = COMMANDS.OPEN_DASHBOARD;
    this._statusBarItem.show();

    this._context.subscriptions.push(this._statusBarItem);
    this._disposables.push(this._statusBarItem);
  }

  private _showStatus(): void {
    const status = this._initialized
      ? 'Active — Phase 001: Foundation initialized.'
      : 'Not initialized.';

    vscode.window.showInformationMessage(`HEADROOM Status: ${status}`);
  }

  dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
    this._initialized = false;
  }

  get extensionContext(): vscode.ExtensionContext {
    return this._context;
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  get storagePath(): string {
    return this._context.globalStorageUri.fsPath;
  }
}

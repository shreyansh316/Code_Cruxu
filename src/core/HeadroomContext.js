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
import { join } from 'path';
import { COMMANDS } from '../constants';
import { ExecutionControl } from '../domain';
import { applyMigrations, ObjectiveRepository, SqliteConnection, TaskRepository } from '../storage';
import { CONFIGURATION_DEFAULTS, validateHeadroomConfiguration, } from './Configuration';
import { registerStatusTreeViews } from './StatusTreeProviders';
import { createSecretStorageAdapter } from '../infrastructure/SecretStorageAdapter';
export class HeadroomContext {
    _context;
    _disposables = [];
    _statusBarItem;
    _initialized = false;
    _configuration = { ...CONFIGURATION_DEFAULTS };
    _databaseConnection = new SqliteConnection();
    _executionControl = new ExecutionControl();
    constructor(context) {
        this._context = context;
    }
    async initialize() {
        if (this._initialized) {
            return;
        }
        try {
            // Open one connection in VS Code's extension-owned global storage and
            // bring its schema up to date on that same owned handle.
            this._databaseConnection.open(join(this.storagePath, 'headroom.sqlite'));
            applyMigrations(this._databaseConnection.database);
            this._disposables.push(...registerStatusTreeViews(this._context, {
                objectives: new ObjectiveRepository(this._databaseConnection.database),
                tasks: new TaskRepository(this._databaseConnection.database),
            }));
            // 1. Register commands
            this._registerCommands();
            // 2. Validate contributed settings and report invalid values once.
            const { configuration, diagnostics } = validateHeadroomConfiguration(vscode.workspace.getConfiguration('headroom'));
            this._configuration = configuration;
            if (diagnostics.length > 0) {
                console.warn('[HEADROOM] Configuration validation:', JSON.stringify({ diagnostics }));
                void vscode.window.showWarningMessage(`HEADROOM is using defaults for ${diagnostics.length} invalid setting(s). See the Extension Host log for details.`);
            }
            // 3. Set up status bar
            this._setupStatusBar();
            // 4. Mark initialized
            this._initialized = true;
            // Show welcome message on first activation
            const isFirstActivation = !this._context.globalState.get('headroom.activated');
            if (isFirstActivation) {
                await this._context.globalState.update('headroom.activated', true);
                vscode.window.showInformationMessage('HEADROOM is active. Open the CEO Dashboard to get started.', 'Open Dashboard').then(selection => {
                    if (selection === 'Open Dashboard') {
                        vscode.commands.executeCommand(COMMANDS.OPEN_DASHBOARD);
                    }
                });
            }
        }
        catch (error) {
            try {
                this.dispose();
            }
            catch (cleanupError) {
                console.error('[HEADROOM] Cleanup after initialization failure:', cleanupError);
            }
            throw error;
        }
    }
    _registerCommands() {
        this._disposables.push(vscode.commands.registerCommand(COMMANDS.OPEN_DASHBOARD, () => {
            // Phase 015: WebviewPanel implementation
            vscode.window.showInformationMessage('HEADROOM: CEO Dashboard — Phase 015');
        }), vscode.commands.registerCommand(COMMANDS.NEW_OBJECTIVE, () => {
            // Phase 052: Objective creation UI
            vscode.window.showInformationMessage('HEADROOM: New Objective — Phase 052');
        }), vscode.commands.registerCommand(COMMANDS.SHOW_STATUS, () => {
            this._showStatus();
        }), vscode.commands.registerCommand(COMMANDS.PAUSE_EXECUTION, () => {
            const result = this._executionControl.pause();
            vscode.window.showInformationMessage(result.changed
                ? 'HEADROOM: Execution paused.'
                : 'HEADROOM: Execution is already paused.');
        }), vscode.commands.registerCommand(COMMANDS.RESUME_EXECUTION, () => {
            const result = this._executionControl.resume();
            vscode.window.showInformationMessage(result.changed
                ? 'HEADROOM: Execution resumed.'
                : 'HEADROOM: Execution is already running.');
        }), vscode.commands.registerCommand(COMMANDS.CONFIGURE_PROVIDER_CREDENTIAL, async () => {
            await this._configureProviderCredential();
        }), vscode.commands.registerCommand(COMMANDS.CLEAR_PROVIDER_CREDENTIAL, async () => {
            await this._clearProviderCredential();
        }));
        // Register all disposables with extension context
        this._context.subscriptions.push(...this._disposables);
    }
    _setupStatusBar() {
        this._statusBarItem = vscode.window.createStatusBarItem('headroom.status', vscode.StatusBarAlignment.Left, 100);
        this._statusBarItem.name = 'HEADROOM Status';
        this._statusBarItem.text = '$(circuit-board) HEADROOM';
        this._statusBarItem.tooltip = 'HEADROOM AI CEO Office — Click to open dashboard';
        this._statusBarItem.command = COMMANDS.OPEN_DASHBOARD;
        this._statusBarItem.show();
        this._context.subscriptions.push(this._statusBarItem);
        this._disposables.push(this._statusBarItem);
    }
    _showStatus() {
        const status = this._initialized
            ? `Active — Execution ${this._executionControl.status.toLowerCase()}.`
            : 'Not initialized.';
        vscode.window.showInformationMessage(`HEADROOM Status: ${status}`);
    }
    async _configureProviderCredential() {
        const provider = await this._pickCredentialProvider();
        if (!provider) return;
        const credential = await vscode.window.showInputBox({
            prompt: `Enter the ${provider} API credential. It will be stored in VS Code SecretStorage.`,
            password: true, ignoreFocusOut: true,
            validateInput: (value) => typeof value === 'string' && value.trim().length > 0
                && value.length <= 4096 && !/[\r\n]/.test(value)
                ? undefined : 'Enter a non-empty, single-line credential of at most 4096 characters.',
        });
        if (credential === undefined) return;
        const store = createSecretStorageAdapter(this._context.secrets);
        try {
            await store.storeCredential(provider, credential);
            vscode.window.showInformationMessage(`HEADROOM: ${provider} credential stored securely.`);
        }
        catch {
            vscode.window.showErrorMessage(`HEADROOM could not store the ${provider} credential in VS Code SecretStorage.`);
        }
    }
    async _clearProviderCredential() {
        const provider = await this._pickCredentialProvider();
        if (!provider) return;
        const store = createSecretStorageAdapter(this._context.secrets);
        try {
            await store.deleteCredential(provider);
            vscode.window.showInformationMessage(`HEADROOM: ${provider} credential removed.`);
        }
        catch {
            vscode.window.showErrorMessage(`HEADROOM could not remove the ${provider} credential from VS Code SecretStorage.`);
        }
    }
    async _pickCredentialProvider() {
        const options = [
            { label: 'Gemini', description: 'Google AI provider', provider: 'gemini' },
            { label: 'OpenAI', description: 'OpenAI provider', provider: 'openai' },
        ];
        const selected = await vscode.window.showQuickPick(options, { placeHolder: 'Select provider credential' });
        return selected?.provider;
    }
    dispose() {
        let disposalError;
        for (const disposable of this._disposables) {
            try {
                disposable.dispose();
            }
            catch (error) {
                disposalError ??= error;
            }
        }
        this._disposables.length = 0;
        this._initialized = false;
        try {
            this._databaseConnection.close();
        }
        catch (error) {
            disposalError ??= error;
        }
        if (disposalError !== undefined) {
            throw disposalError;
        }
    }
    get extensionContext() {
        return this._context;
    }
    get isInitialized() {
        return this._initialized;
    }
    get configuration() {
        return this._configuration;
    }
    get databaseConnection() {
        return this._databaseConnection;
    }
    get executionState() {
        return this._executionControl.status;
    }
    get storagePath() {
        return this._context.globalStorageUri.fsPath;
    }
}

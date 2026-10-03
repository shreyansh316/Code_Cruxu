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
import { randomUUID } from 'node:crypto';
import { COMMANDS } from '../constants';
import { ExecutionControl } from '../domain';
import { AgentRepository, applyMigrations, assertUpgradeCompatible, AuditLogRepository, ObjectiveRepository, SqliteConnection, TaskRepository } from '../storage';
import { CONFIGURATION_DEFAULTS, validateHeadroomConfiguration, } from './Configuration';
import { registerStatusTreeViews } from './StatusTreeProviders';
import { createSecretStorageAdapter } from '../infrastructure/SecretStorageAdapter';
import { createObjectiveIntakeUseCase } from '../application/objectiveIntake';
import { createHumanCodeReviewDecision } from '../application/humanCodeReview';
import { createPersistedPlanDecision } from '../application/persistedPlanDecision';
import { createSqliteUnitOfWork } from '../infrastructure/SqliteUnitOfWork';
export class HeadroomContext {
    _context;
    _disposables = [];
    _statusBarItem;
    _initialized = false;
    _configuration = { ...CONFIGURATION_DEFAULTS };
    _databaseConnection = new SqliteConnection();
    _executionControl = new ExecutionControl();
    _refreshStatusViews = () => {};
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
            assertUpgradeCompatible(this._databaseConnection.database);
            applyMigrations(this._databaseConnection.database);
            const statusViews = registerStatusTreeViews(this._context, {
                objectives: new ObjectiveRepository(this._databaseConnection.database),
                tasks: new TaskRepository(this._databaseConnection.database),
            });
            this._refreshStatusViews = statusViews.refresh;
            this._disposables.push(...statusViews.disposables);
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
        }), vscode.commands.registerCommand(COMMANDS.NEW_OBJECTIVE, async () => {
            await this._createObjective();
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
        }), vscode.commands.registerCommand(COMMANDS.REVIEW_TASK_CHANGES, async (taskId, bundle) => {
            await this._reviewTaskChanges(taskId, bundle);
        }), vscode.commands.registerCommand(COMMANDS.REVIEW_PLAN, async (plan) => {
            return await this._reviewPlan(plan);
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
    async _createObjective() {
        const title = await vscode.window.showInputBox({
            title: 'HEADROOM — New CEO Objective', prompt: 'Enter a concise objective title.',
            placeHolder: 'Objective title', ignoreFocusOut: true,
            validateInput: (value) => typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 200
                ? undefined : 'Title must contain 1 to 200 characters.',
        });
        if (title === undefined) return;
        const description = await vscode.window.showInputBox({
            title: 'HEADROOM — Objective Details', prompt: 'Describe the outcome and constraints.',
            placeHolder: 'Objective description', ignoreFocusOut: true,
            validateInput: (value) => typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 10_000
                ? undefined : 'Description must contain 1 to 10000 characters.',
        });
        if (description === undefined) return;
        const intake = createObjectiveIntakeUseCase({
            objectiveRepository: new ObjectiveRepository(this._databaseConnection.database),
            idFactory: () => randomUUID(),
        });
        const result = await intake.run({ title, description });
        if (!result.ok) {
            vscode.window.showErrorMessage(`HEADROOM could not create the objective: ${result.error.message}`);
            return;
        }
        this._refreshStatusViews();
        vscode.window.showInformationMessage('HEADROOM objective created and saved.');
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
    async _reviewTaskChanges(taskId, bundle) {
        if (typeof taskId !== 'string' || !bundle || bundle.taskId !== taskId || bundle.schemaVersion !== 1) {
            vscode.window.showWarningMessage('HEADROOM: No matching review evidence bundle was provided.');
            return;
        }
        const serialized = JSON.stringify(bundle, null, 2);
        if (Buffer.byteLength(serialized, 'utf8') > 2 * 1024 * 1024) {
            vscode.window.showErrorMessage('HEADROOM: Review evidence exceeds the display limit.');
            return;
        }
        const document = await vscode.workspace.openTextDocument({ language: 'json', content: serialized });
        await vscode.window.showTextDocument(document, { preview: false });
        const agents = new AgentRepository(this._databaseConnection.database).listByRole('CEO');
        if (agents.length !== 1) {
            vscode.window.showErrorMessage('HEADROOM: Review requires exactly one persisted CEO identity.');
            return;
        }
        const task = new TaskRepository(this._databaseConnection.database).getById(taskId);
        if (!task) {
            vscode.window.showErrorMessage('HEADROOM: The reviewed task no longer exists.');
            return;
        }
        const decision = await vscode.window.showQuickPick([
            { label: 'Approve Changes', description: 'Record approval for this exact evidence bundle.', value: 'APPROVE' },
            { label: 'Request Changes', description: 'Record that these changes need more work.', value: 'REQUEST_CHANGES' },
        ], { title: `HEADROOM — Review ${task.title}`, placeHolder: 'Choose a review decision. Closing this picker records nothing.' });
        if (!decision) return;
        const useCase = createHumanCodeReviewDecision({
            agentRepository: new AgentRepository(this._databaseConnection.database),
            taskRepository: new TaskRepository(this._databaseConnection.database),
            auditRepository: new AuditLogRepository(this._databaseConnection.database),
            unitOfWork: createSqliteUnitOfWork(this._databaseConnection.database),
            clock: { now: () => new Date() }, idFactory: () => randomUUID(),
        });
        const result = await useCase.run({ reviewerId: agents[0].id, taskId, bundle, decision: decision.value });
        if (!result.ok) {
            vscode.window.showErrorMessage(`HEADROOM could not record the review: ${result.error.message}`);
            return;
        }
        vscode.window.showInformationMessage(`HEADROOM: ${decision.label} recorded for this evidence bundle.`);
    }
    async _reviewPlan(plan) {
        if (!plan || typeof plan !== 'object') {
            vscode.window.showWarningMessage('HEADROOM: No execution plan was provided for review.');
            return;
        }
        const serialized = JSON.stringify(plan, null, 2);
        if (Buffer.byteLength(serialized, 'utf8') > 1024 * 1024) {
            vscode.window.showErrorMessage('HEADROOM: Execution plan exceeds the review display limit.');
            return;
        }
        const document = await vscode.workspace.openTextDocument({ language: 'json', content: serialized });
        await vscode.window.showTextDocument(document, { preview: false });
        const agents = new AgentRepository(this._databaseConnection.database).listByRole('CEO');
        if (agents.length !== 1) {
            vscode.window.showErrorMessage('HEADROOM: Plan approval requires exactly one persisted CEO identity.');
            return;
        }
        const decision = await vscode.window.showQuickPick([
            { label: 'Approve Plan', description: 'Authorize this plan for execution.', value: 'APPROVED' },
            { label: 'Reject Plan', description: 'Reject this plan and prevent execution.', value: 'REJECTED' },
        ], { title: 'HEADROOM — Review Execution Plan', placeHolder: 'Choose a plan decision. Closing this picker records nothing.' });
        if (!decision) return;
        const useCase = createPersistedPlanDecision({ agentRepository: new AgentRepository(this._databaseConnection.database),
            auditRepository: new AuditLogRepository(this._databaseConnection.database),
            unitOfWork: createSqliteUnitOfWork(this._databaseConnection.database),
            clock: { now: () => new Date() }, idFactory: () => randomUUID() });
        const result = await useCase.run({ approverId: agents[0].id, plan, decision: decision.value });
        if (!result.ok) {
            vscode.window.showErrorMessage(`HEADROOM could not record the plan decision: ${result.error.message}`);
            return;
        }
        vscode.window.showInformationMessage(`HEADROOM: Plan ${decision.value.toLowerCase()} and saved to the audit log.`);
        return result.value;
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

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
import { AgentRepository, applyMigrations, assertUpgradeCompatible, AuditLogRepository, diagnoseDatabaseIntegrity,
    ExecutionQueueRepository, ObjectiveRepository, SqliteConnection, TaskRepository } from '../storage';
import { CONFIGURATION_DEFAULTS, validateHeadroomConfiguration, } from './Configuration';
import { registerStatusTreeViews } from './StatusTreeProviders';
import { createSecretStorageAdapter } from '../infrastructure/SecretStorageAdapter';
import { createObjectiveIntakeUseCase } from '../application/objectiveIntake';
import { createHumanCodeReviewDecision } from '../application/humanCodeReview';
import { createPersistedPlanDecision } from '../application/persistedPlanDecision';
import { createSqliteUnitOfWork } from '../infrastructure/SqliteUnitOfWork';
import { getMessage } from './messages';
const HEALTH_CHECKS = Object.freeze([
    { id: 'database', label: 'Database' }, { id: 'queue', label: 'Queue' },
    { id: 'provider', label: 'AI provider' }, { id: 'verification', label: 'Verification' },
]);

/** Read each health source independently so an unavailable service does not hide the rest. */
export async function readOperationalHealth(sources) {
    const values = await Promise.all(HEALTH_CHECKS.map(async ({ id, label }) => {
        try {
            const source = sources?.[id];
            if (typeof source !== 'function') throw new Error('unavailable');
            const value = await source();
            if (!value || typeof value !== 'object') throw new Error('unavailable');
            if (id === 'database') return { id, label, status: value.status,
                detail: value.status === 'HEALTHY' ? `SQLite healthy; schema ${value.schemaVersion ?? 'unknown'}.`
                    : `SQLite ${value.status?.toLowerCase() ?? 'unavailable'}; ${value.issues?.length ?? 0} issue(s).` };
            if (id === 'queue') {
                if (!Number.isSafeInteger(value.queued) || value.queued < 0 || !Number.isSafeInteger(value.claimed) || value.claimed < 0) {
                    throw new Error('unavailable');
                }
                return { id, label, status: 'HEALTHY', detail: `${value.queued} queued; ${value.claimed} claimed.` };
            }
            if (id === 'provider') return { id, label, status: value.status, detail: value.detail };
            return { id, label, status: value.status, detail: value.detail };
        } catch {
            return { id, label, status: 'UNAVAILABLE', detail: `${label} status unavailable.` };
        }
    }));
    return values;
}

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
            const queueRepository = new ExecutionQueueRepository(this._databaseConnection.database);
            const statusViews = registerStatusTreeViews(this._context, {
                objectives: new ObjectiveRepository(this._databaseConnection.database),
                tasks: new TaskRepository(this._databaseConnection.database),
            }, async () => readOperationalHealth({
                database: () => diagnoseDatabaseIntegrity(this._databaseConnection.database),
                queue: () => ({ queued: queueRepository.listByState('QUEUED').length,
                    claimed: queueRepository.listByState('CLAIMED').length }),
                provider: async () => this._providerHealth(),
                verification: () => ({ status: 'NOT_RUN', detail: 'No verification result is currently recorded.' }),
            }));
            this._refreshStatusViews = statusViews.refresh;
            this._disposables.push(...statusViews.disposables);
            // 1. Register commands
            this._registerCommands();
            // 2. Validate contributed settings and report invalid values once.
            const { configuration, diagnostics } = validateHeadroomConfiguration(vscode.workspace.getConfiguration('headroom'));
            this._configuration = configuration;
            if (diagnostics.length > 0) {
                console.warn('[HEADROOM] Configuration validation:', JSON.stringify({ diagnostics }));
                void vscode.window.showWarningMessage(getMessage('settings.invalid', { count: diagnostics.length }));
            }
            // 3. Set up status bar
            this._setupStatusBar();
            // 4. Mark initialized
            this._initialized = true;
            // Show welcome message on first activation
            const isFirstActivation = !this._context.globalState.get('headroom.activated');
            if (isFirstActivation) {
                await this._context.globalState.update('headroom.activated', true);
                const openDashboardAction = { title: getMessage('welcome.openDashboard'), command: COMMANDS.OPEN_DASHBOARD };
                vscode.window.showInformationMessage(getMessage('welcome.message'), openDashboardAction).then(selection => {
                    if (selection?.command === COMMANDS.OPEN_DASHBOARD) {
                        vscode.commands.executeCommand(selection.command);
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
            vscode.window.showInformationMessage(getMessage('dashboard.placeholder'));
        }), vscode.commands.registerCommand(COMMANDS.NEW_OBJECTIVE, async () => {
            await this._createObjective();
        }), vscode.commands.registerCommand(COMMANDS.SHOW_STATUS, () => {
            this._showStatus();
        }), vscode.commands.registerCommand(COMMANDS.PAUSE_EXECUTION, () => {
            const result = this._executionControl.pause();
            vscode.window.showInformationMessage(result.changed
                ? getMessage('execution.paused')
                : getMessage('execution.alreadyPaused'));
        }), vscode.commands.registerCommand(COMMANDS.RESUME_EXECUTION, () => {
            const result = this._executionControl.resume();
            vscode.window.showInformationMessage(result.changed
                ? getMessage('execution.resumed')
                : getMessage('execution.alreadyRunning'));
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
        this._statusBarItem.name = getMessage('statusBar.name');
        this._statusBarItem.text = getMessage('statusBar.text');
        this._statusBarItem.tooltip = getMessage('statusBar.tooltip');
        this._statusBarItem.command = COMMANDS.OPEN_DASHBOARD;
        this._statusBarItem.show();
        this._context.subscriptions.push(this._statusBarItem);
        this._disposables.push(this._statusBarItem);
    }
    _showStatus() {
        const status = this._initialized
            ? getMessage('status.active', { state: this._executionControl.status.toLowerCase() })
            : getMessage('status.inactive');
        vscode.window.showInformationMessage(getMessage('status.message', { status }));
    }
    async _providerHealth() {
        if (this._configuration.aiProvider === 'mock') return { status: 'READY', detail: 'Mock provider selected.' };
        try {
            const credentials = createSecretStorageAdapter(this._context.secrets);
            const configured = await credentials.hasCredential(this._configuration.aiProvider);
            return configured ? { status: 'READY', detail: `${this._configuration.aiProvider} credential is configured.` }
                : { status: 'UNAVAILABLE', detail: `${this._configuration.aiProvider} credential is not configured.` };
        } catch {
            return { status: 'UNAVAILABLE', detail: 'Provider credential status is unavailable.' };
        }
    }
    async _createObjective() {
        const title = await vscode.window.showInputBox({
            title: getMessage('objective.title'), prompt: getMessage('objective.title.prompt'),
            placeHolder: getMessage('objective.title.placeholder'), ignoreFocusOut: true,
            validateInput: (value) => typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 200
                ? undefined : getMessage('objective.title.invalid'),
        });
        if (title === undefined) return;
        const description = await vscode.window.showInputBox({
            title: getMessage('objective.description.title'), prompt: getMessage('objective.description.prompt'),
            placeHolder: getMessage('objective.description.placeholder'), ignoreFocusOut: true,
            validateInput: (value) => typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 10_000
                ? undefined : getMessage('objective.description.invalid'),
        });
        if (description === undefined) return;
        const intake = createObjectiveIntakeUseCase({
            objectiveRepository: new ObjectiveRepository(this._databaseConnection.database),
            idFactory: () => randomUUID(),
        });
        const result = await intake.run({ title, description });
        if (!result.ok) {
            vscode.window.showErrorMessage(getMessage('objective.create.failed', { error: result.error.message }));
            return;
        }
        this._refreshStatusViews();
        vscode.window.showInformationMessage(getMessage('objective.created'));
    }
    async _configureProviderCredential() {
        const provider = await this._pickCredentialProvider();
        if (!provider) return;
        const credential = await vscode.window.showInputBox({
            prompt: getMessage('credential.prompt', { provider }),
            password: true, ignoreFocusOut: true,
            validateInput: (value) => typeof value === 'string' && value.trim().length > 0
                && value.length <= 4096 && !/[\r\n]/.test(value)
                ? undefined : getMessage('credential.invalid'),
        });
        if (credential === undefined) return;
        const store = createSecretStorageAdapter(this._context.secrets);
        try {
            await store.storeCredential(provider, credential);
            vscode.window.showInformationMessage(getMessage('credential.stored', { provider }));
        }
        catch {
            vscode.window.showErrorMessage(getMessage('credential.storeFailed', { provider }));
        }
    }
    async _clearProviderCredential() {
        const provider = await this._pickCredentialProvider();
        if (!provider) return;
        const store = createSecretStorageAdapter(this._context.secrets);
        try {
            await store.deleteCredential(provider);
            vscode.window.showInformationMessage(getMessage('credential.removed', { provider }));
        }
        catch {
            vscode.window.showErrorMessage(getMessage('credential.removeFailed', { provider }));
        }
    }
    async _reviewTaskChanges(taskId, bundle) {
        if (typeof taskId !== 'string' || !bundle || bundle.taskId !== taskId || bundle.schemaVersion !== 1) {
            vscode.window.showWarningMessage(getMessage('review.bundle.missing'));
            return;
        }
        const serialized = JSON.stringify(bundle, null, 2);
        if (Buffer.byteLength(serialized, 'utf8') > 2 * 1024 * 1024) {
            vscode.window.showErrorMessage(getMessage('review.bundle.tooLarge'));
            return;
        }
        const document = await vscode.workspace.openTextDocument({ language: 'json', content: serialized });
        await vscode.window.showTextDocument(document, { preview: false });
        const agents = new AgentRepository(this._databaseConnection.database).listByRole('CEO');
        if (agents.length !== 1) {
            vscode.window.showErrorMessage(getMessage('review.ceo.missing'));
            return;
        }
        const task = new TaskRepository(this._databaseConnection.database).getById(taskId);
        if (!task) {
            vscode.window.showErrorMessage(getMessage('review.task.missing'));
            return;
        }
        const decision = await vscode.window.showQuickPick([
            { label: getMessage('review.approveChanges'), description: getMessage('review.approveChanges.description'), value: 'APPROVE' },
            { label: getMessage('review.requestChanges'), description: getMessage('review.requestChanges.description'), value: 'REQUEST_CHANGES' },
        ], { title: getMessage('review.task.title', { title: task.title }), placeHolder: getMessage('review.decision.placeholder') });
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
            vscode.window.showErrorMessage(getMessage('review.recordFailed', { error: result.error.message }));
            return;
        }
        const decisionMessage = decision.value === 'APPROVE'
            ? getMessage('review.approveChanges') : getMessage('review.requestChanges');
        vscode.window.showInformationMessage(getMessage('review.recorded', { decision: decisionMessage }));
    }
    async _reviewPlan(plan) {
        if (!plan || typeof plan !== 'object') {
            vscode.window.showWarningMessage(getMessage('plan.missing'));
            return;
        }
        const serialized = JSON.stringify(plan, null, 2);
        if (Buffer.byteLength(serialized, 'utf8') > 1024 * 1024) {
            vscode.window.showErrorMessage(getMessage('plan.tooLarge'));
            return;
        }
        const document = await vscode.workspace.openTextDocument({ language: 'json', content: serialized });
        await vscode.window.showTextDocument(document, { preview: false });
        const agents = new AgentRepository(this._databaseConnection.database).listByRole('CEO');
        if (agents.length !== 1) {
            vscode.window.showErrorMessage(getMessage('plan.ceo.missing'));
            return;
        }
        const decision = await vscode.window.showQuickPick([
            { label: getMessage('plan.approve'), description: getMessage('plan.approve.description'), value: 'APPROVED' },
            { label: getMessage('plan.reject'), description: getMessage('plan.reject.description'), value: 'REJECTED' },
        ], { title: getMessage('plan.title'), placeHolder: getMessage('plan.decision.placeholder') });
        if (!decision) return;
        const useCase = createPersistedPlanDecision({ agentRepository: new AgentRepository(this._databaseConnection.database),
            auditRepository: new AuditLogRepository(this._databaseConnection.database),
            unitOfWork: createSqliteUnitOfWork(this._databaseConnection.database),
            clock: { now: () => new Date() }, idFactory: () => randomUUID() });
        const result = await useCase.run({ approverId: agents[0].id, plan, decision: decision.value });
        if (!result.ok) {
            vscode.window.showErrorMessage(getMessage('plan.recordFailed', { error: result.error.message }));
            return;
        }
        const planDecision = decision.value === 'APPROVED' ? getMessage('plan.approve') : getMessage('plan.reject');
        vscode.window.showInformationMessage(getMessage('plan.recorded', { decision: planDecision.toLowerCase() }));
        return result.value;
    }
    async _pickCredentialProvider() {
        const options = [
            { label: 'Gemini', description: getMessage('credential.gemini.description'), provider: 'gemini' },
            { label: 'OpenAI', description: getMessage('credential.openai.description'), provider: 'openai' },
        ];
        const selected = await vscode.window.showQuickPick(options, { placeHolder: getMessage('credential.select') });
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

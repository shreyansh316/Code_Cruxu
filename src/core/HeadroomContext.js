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
import { basename, join } from 'path';
import { randomUUID } from 'node:crypto';
import { AgentRole, COMMANDS } from '../constants';
import { ExecutionControl, isAgentAvailable } from '../domain';
import { AgentRepository, applyMigrations, assertUpgradeCompatible, AuditLogRepository, diagnoseDatabaseIntegrity,
    DepartmentRepository, DirectorQuestionRepository, ExecutionQueueRepository, ObjectiveRepository, OfficeRepository, OrganizationRepository,
    ProjectRepository, SqliteConnection, TaskDependencyRepository, TaskRepository } from '../storage';
import { CONFIGURATION_DEFAULTS, validateHeadroomConfiguration, } from './Configuration';
import { registerStatusTreeViews } from './StatusTreeProviders';
import { CommandCenterPanel, createCommandCenterSnapshot } from './CommandCenterPanel';
import { ExecutionActivityFeed } from './ExecutionActivityFeed';
import { createSecretStorageAdapter } from '../infrastructure/SecretStorageAdapter';
import { createObjectiveIntakeUseCase } from '../application/objectiveIntake';
import { createHumanCodeReviewDecision } from '../application/humanCodeReview';
import { createReviewEvidenceExplanation } from '../application/codeExplanation';
import { createGitStateAdapter, createSqliteUnitOfWork } from '../infrastructure';
import { configureTaskToolPermissions, manageAgentLifecycle, recordEngineeringDecision, recallEngineeringDecisions, showEngineeringDecisions }
    from './HeadroomAdministrationCommands';
import { registerDebuggingCommands } from './HeadroomDebuggingCommands';
import { executeAssignedTask } from './HeadroomTaskExecutionCommands';
import { registerUsageCommands } from './HeadroomUsageCommands';
import { saveReviewFindingsFromEditor } from './ReviewFindingCommands';
import { getMessage } from './messages';
import { redactSecrets } from '../shared/redactSecrets';
import { directorRequestBlock, createDirectorProvider } from './directorRequestFlow';
import { analyzeObjective, proposePlan, reviewPlan, answerDirectorQuestion, explainSelection, reviewSelection,
    resolveObjectiveOrganization } from './HeadroomDirectorCommands';
export { readOperationalHealth } from './operationalHealth';
export class HeadroomContext {
    _context;
    _disposables = [];
    _statusBarItem;
    _initialized = false;
    _initialization;
    _configuration = { ...CONFIGURATION_DEFAULTS };
    _databaseConnection = new SqliteConnection();
    _executionControl = new ExecutionControl();
    _refreshStatusViews = () => {};
    _commandCenter;
    _executionActivity = new ExecutionActivityFeed();
    _gitStateAdapters = new Map();
    _directorRequestController;
    _activeTaskExecution;
    constructor(context) {
        this._context = context;
    }
    initialize() {
        if (this._initialized) return Promise.resolve();
        if (this._initialization) return this._initialization;
        const operation = this._initialize();
        this._initialization = operation;
        return operation.finally(() => {
            if (this._initialization === operation) this._initialization = undefined;
        });
    }
    async _initialize() {
        try {
            // Open one connection in VS Code's extension-owned global storage and
            // bring its schema up to date on that same owned handle.
            this._databaseConnection.open(join(this.storagePath, 'headroom.sqlite'));
            assertUpgradeCompatible(this._databaseConnection.database);
            applyMigrations(this._databaseConnection.database);
            const queueRepository = new ExecutionQueueRepository(this._databaseConnection.database);
            const agentRepository = new AgentRepository(this._databaseConnection.database);
            const objectiveRepository = new ObjectiveRepository(this._databaseConnection.database);
            const directorQuestionRepository = new DirectorQuestionRepository(this._databaseConnection.database);
            const auditLogRepository = new AuditLogRepository(this._databaseConnection.database);
            this._executionActivity = new ExecutionActivityFeed({ auditRepository: auditLogRepository });
            const taskRepository = new TaskRepository(this._databaseConnection.database);
            const organizationRepository = new OrganizationRepository(this._databaseConnection.database);
            const officeRepository = new OfficeRepository(this._databaseConnection.database);
            const departmentRepository = new DepartmentRepository(this._databaseConnection.database);
            const projectRepository = new ProjectRepository(this._databaseConnection.database);
            const statusViews = registerStatusTreeViews(this._context, {
                organizations: organizationRepository,
                offices: officeRepository,
                departments: departmentRepository,
                agents: agentRepository,
                directorQuestions: directorQuestionRepository,
                objectives: objectiveRepository,
                tasks: taskRepository,
                projects: projectRepository,
            }, async () => readOperationalHealth({
                database: () => diagnoseDatabaseIntegrity(this._databaseConnection.database),
                queue: () => ({ queued: queueRepository.listByState('QUEUED').length,
                    claimed: queueRepository.listByState('CLAIMED').length }),
                provider: async () => this._providerHealth(),
                verification: () => ({ status: 'NOT_RUN', detail: 'No verification result is currently recorded.' }),
            }));
            this._stateChangeEmitter = new vscode.EventEmitter();
            this._refreshStatusViews = () => {
                statusViews.refresh();
                this._stateChangeEmitter.fire(undefined);
            };
            for (const disposable of statusViews.disposables) this._addDisposable(disposable);
            this._commandCenter = new CommandCenterPanel(async () => createCommandCenterSnapshot({
                objectives: objectiveRepository.list(),
                tasks: taskRepository.list(),
                projects: projectRepository.list(),
                directorQuestions: directorQuestionRepository.list(),
                activity: auditLogRepository.listRecent({ limit: 20 }),
                executionActivity: this._executionActivity.listRecent({ limit: 20 }),
                changedFiles: await this._readWorkspaceChangedFiles(createGitStateAdapter),
                agents: agentRepository.list(),
                offices: officeRepository.list(),
                departments: departmentRepository.list(),
                organizations: organizationRepository.list(),
                operationalHealth: await this._readOperationalHealth(),
                currentWork: this._readCurrentWork(),
                collapsedSections: this._getCollapsedCommandCenterSections(),
                workspace: {
                    folders: (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.name),
                    activeFile: vscode.window.activeTextEditor?.document?.fileName
                        ? basename(vscode.window.activeTextEditor.document.fileName) : '',
                    languageId: vscode.window.activeTextEditor?.document?.languageId ?? '',
                },
                executionStatus: this._executionControl.status,
            }), (section, collapsed) => this._setCollapsedCommandCenterSection(section, collapsed),
            () => this._answerDirectorQuestion(),
            {
                onOpenObjective: (title) => this._openObjectiveAction(title),
                onOpenTask: (title) => this._openTaskAction(title),
                onInspectHealth: () => this._inspectHealthAction(),
                onRunTask: () => vscode.commands.executeCommand(COMMANDS.RUN_ASSIGNED_TASK),
                onStateChange: this._stateChangeEmitter,
            });
            this._addDisposable(this._commandCenter);
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
    async _readWorkspaceChangedFiles(createGitAdapter) {
        const folders = (vscode.workspace.workspaceFolders ?? []).slice(0, 10);
        const snapshots = await Promise.all(folders.map(async (folder) => {
            const root = folder?.uri?.fsPath;
            if (typeof root !== 'string' || !root) return [];
            try {
                let adapterPromise = this._gitStateAdapters.get(root);
                if (!adapterPromise) {
                    adapterPromise = createGitAdapter({ workspaceRoot: root });
                    this._gitStateAdapters.set(root, adapterPromise);
                }
                let adapter;
                try { adapter = await adapterPromise; }
                catch (error) {
                    this._gitStateAdapters.delete(root);
                    throw error;
                }
                return (await adapter.getChangedFiles()).map((record) => ({
                    ...record, path: folders.length > 1 ? `${folder.name}/${record.path}` : record.path,
                    originalPath: record.originalPath && folders.length > 1 ? `${folder.name}/${record.originalPath}` : record.originalPath,
                }));
            }
            catch {
                return [];
            }
        }));
        const activeRoots = new Set(folders.map((folder) => folder?.uri?.fsPath).filter((root) => typeof root === 'string'));
        for (const root of this._gitStateAdapters.keys()) {
            if (!activeRoots.has(root)) this._gitStateAdapters.delete(root);
        }
        return snapshots.flat().slice(0, 20);
    }
    _registerCommands() {
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.OPEN_DASHBOARD, () => {
            this._commandCenter.show();
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.NEW_OBJECTIVE, async () => {
            await this._createObjective();
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.ANALYZE_OBJECTIVE, async () => {
            await this._analyzeObjective();
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.PROPOSE_PLAN, async () => {
            await this._proposePlan();
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.SHOW_STATUS, () => {
            this._showStatus();
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.PAUSE_EXECUTION, () => {
            const result = this._executionControl.pause();
            vscode.window.showInformationMessage(result.changed
                ? getMessage('execution.paused')
                : getMessage('execution.alreadyPaused'));
            this._commandCenter?.refresh();
            this._refreshStatusViews();
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.RESUME_EXECUTION, () => {
            const result = this._executionControl.resume();
            vscode.window.showInformationMessage(result.changed
                ? getMessage('execution.resumed')
                : getMessage('execution.alreadyRunning'));
            this._commandCenter?.refresh();
            this._refreshStatusViews();
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.CANCEL_EXECUTION, async () => {
            if (this._executionControl.status === 'CANCELLED') {
                vscode.window.showInformationMessage(getMessage('execution.alreadyCancelled'));
                return;
            }
            const confirmation = await vscode.window.showWarningMessage(
                getMessage('execution.cancelConfirmation'), { modal: true }, getMessage('execution.cancelConfirm'));
            if (confirmation !== getMessage('execution.cancelConfirm')) return;
            const result = this._activeTaskExecution?.cancel() ?? this._executionControl.cancel();
            this._directorRequestController?.abort();
            vscode.window.showInformationMessage(result.changed
                ? getMessage('execution.cancelled')
                : getMessage('execution.alreadyCancelled'));
            this._commandCenter?.refresh();
            this._refreshStatusViews();
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.CONFIGURE_PROVIDER_CREDENTIAL, async () => {
            await this._configureProviderCredential();
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.CLEAR_PROVIDER_CREDENTIAL, async () => {
            await this._clearProviderCredential();
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.REVIEW_TASK_CHANGES, async (taskId, bundle) => {
            await this._reviewTaskChanges(taskId, bundle);
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.REVIEW_PLAN, async (plan) => {
            return await this._reviewPlan(plan);
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.MANAGE_AGENT_LIFECYCLE, async () => {
            await this._manageAgentLifecycle();
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.EXPLAIN_SELECTION, async () => {
            await this._explainSelection();
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.REVIEW_SELECTION, async (area) => {
            await this._reviewSelection(area);
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.SAVE_REVIEW_FINDINGS, async () => {
            await saveReviewFindingsFromEditor({ database: this._databaseConnection.database });
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.SHOW_ENGINEERING_DECISIONS, async (taskId) => {
            await this._showEngineeringDecisions(taskId);
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.RECALL_ENGINEERING_DECISIONS, async () => {
            await recallEngineeringDecisions({ database: this._databaseConnection.database });
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.RECORD_ENGINEERING_DECISION, async (taskId) => {
            await this._recordEngineeringDecision(taskId);
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.CONFIGURE_TASK_TOOL_PERMISSIONS, async () => {
            await configureTaskToolPermissions({ database: this._databaseConnection.database,
                refresh: () => this._commandCenter?.refresh(), refreshStatus: this._refreshStatusViews });
        }));
        this._addDisposable(vscode.commands.registerCommand(COMMANDS.RUN_ASSIGNED_TASK, async () => {
            await executeAssignedTask({ database: this._databaseConnection.database, context: this._context,
                configuration: this._configuration, executionControl: this._executionControl,
                activity: this._executionActivity,
                onExecution: (execution) => { this._activeTaskExecution = execution; },
                refresh: () => this._commandCenter?.refresh(), refreshStatus: this._refreshStatusViews });
        }));
        registerUsageCommands(this);
        registerDebuggingCommands(this);
    }
    _addDisposable(disposable) {
        if (!disposable || typeof disposable.dispose !== 'function') {
            throw new TypeError('VS Code registration did not return a disposable.');
        }
        this._disposables.push(disposable);
        if (Array.isArray(this._context.subscriptions) && !this._context.subscriptions.includes(disposable)) {
            this._context.subscriptions.push(disposable);
        }
        return disposable;
    }
    _setupStatusBar() {
        this._statusBarItem = vscode.window.createStatusBarItem('headroom.status', vscode.StatusBarAlignment.Left, 100);
        this._statusBarItem.name = getMessage('statusBar.name');
        this._statusBarItem.text = getMessage('statusBar.text');
        this._statusBarItem.tooltip = getMessage('statusBar.tooltip');
        this._statusBarItem.command = COMMANDS.OPEN_DASHBOARD;
        this._statusBarItem.show();
        this._addDisposable(this._statusBarItem);
    }
    _showStatus() {
        const status = this._initialized
            ? getMessage('status.active', { state: this._executionControl.status.toLowerCase() })
            : getMessage('status.inactive');
        vscode.window.showInformationMessage(getMessage('status.message', { status }));
    }
    async _showEngineeringDecisions(taskId) {
        await showEngineeringDecisions({ database: this._databaseConnection.database, taskId });
    }
    async _recordEngineeringDecision(taskId) {
        await recordEngineeringDecision({ database: this._databaseConnection.database, taskId,
            refresh: () => this._commandCenter?.refresh() });
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
        const database = this._databaseConnection.database;
        const agentRepository = new AgentRepository(database);
        const organizations = new OrganizationRepository(database).list()
            .map((organization) => ({ organization, ceos: agentRepository.listByOrganization(organization.id)
                .filter((agent) => agent.role === AgentRole.CEO && isAgentAvailable(agent)) }))
            .filter(({ ceos }) => ceos.length === 1)
            .sort((a, b) => a.organization.name.localeCompare(b.organization.name) || a.organization.id.localeCompare(b.organization.id));
        if (!organizations.length) {
            vscode.window.showInformationMessage('Create an organization with exactly one active CEO before submitting an objective.');
            return;
        }
        let selected = { organization: organizations[0].organization, ceoId: organizations[0].ceos[0].id };
        if (organizations.length > 1) {
            const selectedOrganization = await vscode.window.showQuickPick(organizations.map(({ organization, ceos }) => ({
                label: organization.name, description: organization.id, organization, ceoId: ceos[0].id,
            })), { title: getMessage('objective.organization.pick'), ignoreFocusOut: true });
            selected = selectedOrganization && { organization: selectedOrganization.organization, ceoId: selectedOrganization.ceoId };
        }
        if (!selected) return;
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
            objectiveRepository: new ObjectiveRepository(database),
            organizationRepository: new OrganizationRepository(database),
            agentRepository,
            idFactory: () => randomUUID(),
        });
        const result = await intake.run({ ceoId: selected.ceoId, organizationId: selected.organization.id, title, description });
        if (!result.ok) {
            vscode.window.showErrorMessage(getMessage('objective.create.failed', { error: result.error.message }));
            return;
        }
        this._refreshStatusViews();
        this._commandCenter?.refresh();
        vscode.window.showInformationMessage(getMessage('objective.created'));
    }
    _directorCommandDeps() {
        const context = this;
        return {
            get database() { return context._databaseConnection.database; },
            get configuration() { return context._configuration; },
            executionControl: this._executionControl,
            createProvider: (purpose) => context._createDirectorProvider(context._databaseConnection.database, purpose),
            beginRequest: () => this._beginDirectorRequest(),
            endRequest: (controller) => {
                if (this._directorRequestController === controller) this._directorRequestController = undefined;
            },
            refresh: () => {
                this._refreshStatusViews();
                this._commandCenter?.refresh();
            },
            reviewPlan: (plan) => this._reviewPlan(plan),
        };
    }
    async _analyzeObjective() {
        return analyzeObjective(this._directorCommandDeps());
    }
    async _explainSelection() {
        return explainSelection(this._directorCommandDeps());
    }
    async _reviewSelection(area = 'FULL') {
        return reviewSelection(this._directorCommandDeps(), area);
    }
    async _proposePlan() {
        return proposePlan(this._directorCommandDeps());
    }
    _createDirectorProvider(database, purpose) {
        return createDirectorProvider({ secrets: this._context.secrets, database,
            providerName: this._configuration?.aiProvider ?? null, purpose });
    }
    _beginDirectorRequest() {
        const blocked = directorRequestBlock(this._executionControl.status,
            { alreadyRunning: Boolean(this._directorRequestController) });
        if (blocked) {
            vscode.window.showInformationMessage(getMessage(blocked));
            return undefined;
        }
        const controller = new AbortController();
        this._directorRequestController = controller;
        return controller;
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
        let explanation;
        try {
            explanation = createReviewEvidenceExplanation(bundle, { selected: 'Evidence for this task change' });
        }
        catch {
            // Preserve the existing evidence review when an older/test bundle
            // does not include the complete comparison and provenance contract.
        }
        const serialized = JSON.stringify(explanation ? { explanation, reviewEvidence: bundle } : bundle, null, 2);
        if (Buffer.byteLength(serialized, 'utf8') > 2 * 1024 * 1024) {
            vscode.window.showErrorMessage(getMessage('review.bundle.tooLarge'));
            return;
        }
        const document = await vscode.workspace.openTextDocument({ language: 'json', content: serialized });
        await vscode.window.showTextDocument(document, { preview: false });
        const database = this._databaseConnection.database;
        const taskRepository = new TaskRepository(database);
        const task = taskRepository.getById(taskId);
        if (!task) {
            vscode.window.showErrorMessage(getMessage('review.task.missing'));
            return;
        }
        const projectRepository = new ProjectRepository(database);
        const project = projectRepository.getById(task.projectId);
        const objectiveRepository = new ObjectiveRepository(database);
        const objective = project?.objectiveId ? objectiveRepository.getById(project.objectiveId) : undefined;
        const organization = await resolveObjectiveOrganization(objective, { database });
        if (!objective || !organization) {
            vscode.window.showErrorMessage(getMessage('review.ceo.missing'));
            return;
        }
        const agentRepository = new AgentRepository(database);
        let reviewers = agentRepository.listByOrganization(organization.id)
            .filter((agent) => agent.role === AgentRole.CEO && isAgentAvailable(agent));
        if (reviewers.length > 1) {
            const selectedCEO = await vscode.window.showQuickPick(reviewers.map((agent) => ({
                label: agent.name, description: agent.id, agent,
            })), { title: getMessage('review.task.title', { title: task.title }), ignoreFocusOut: true });
            if (!selectedCEO) return;
            reviewers = [selectedCEO.agent];
        }
        if (reviewers.length !== 1) {
            vscode.window.showErrorMessage(getMessage('review.ceo.missing'));
            return;
        }
        const decision = await vscode.window.showQuickPick([
            { label: getMessage('review.approveChanges'), description: getMessage('review.approveChanges.description'), value: 'APPROVE' },
            { label: getMessage('review.requestChanges'), description: getMessage('review.requestChanges.description'), value: 'REQUEST_CHANGES' },
        ], { title: getMessage('review.task.title', { title: task.title }), placeHolder: getMessage('review.decision.placeholder') });
        if (!decision) return;
        if (!objective.organizationId) objectiveRepository.update(objective.id, { organizationId: organization.id });
        const useCase = createHumanCodeReviewDecision({
            agentRepository, taskRepository, projectRepository, objectiveRepository,
            auditRepository: new AuditLogRepository(database),
            unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => new Date() }, idFactory: () => randomUUID(),
        });
        const result = await useCase.run({ reviewerId: reviewers[0].id, taskId, bundle, decision: decision.value });
        if (!result.ok) {
            vscode.window.showErrorMessage(getMessage('review.recordFailed', { error: result.error.message }));
            return;
        }
        const decisionMessage = decision.value === 'APPROVE'
            ? getMessage('review.approveChanges') : getMessage('review.requestChanges');
        vscode.window.showInformationMessage(getMessage('review.recorded', { decision: decisionMessage }));
    }
    async _reviewPlan(plan) {
        return reviewPlan(plan, {
            database: this._databaseConnection.database,
            refresh: () => {
                this._refreshStatusViews();
                this._commandCenter?.refresh();
            },
        });
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
        this._initialized = false;
        try {
            this._stateChangeEmitter?.dispose?.();
        } catch (error) {
            disposalError ??= error;
        }
        for (const disposable of this._disposables.splice(0).reverse()) {
            try {
                disposable.dispose();
            }
            catch (error) {
                disposalError ??= error;
            }
            if (Array.isArray(this._context.subscriptions)) {
                const index = this._context.subscriptions.indexOf(disposable);
                if (index >= 0) this._context.subscriptions.splice(index, 1);
            }
        }
        this._gitStateAdapters.clear();
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
    _getCollapsedCommandCenterSections() {
        const saved = this._context.globalState.get('headroom.commandCenter.collapsedSections', []);
        if (!Array.isArray(saved)) return [];
        return saved.filter((section) => ['objectives', 'tasks', 'completed-tasks', 'task-errors', 'director-questions', 'activity', 'execution-activity'].includes(section));
    }
    _setCollapsedCommandCenterSection(section, collapsed) {
        const allowed = ['objectives', 'tasks', 'completed-tasks', 'task-errors', 'director-questions', 'activity', 'execution-activity'];
        if (!allowed.includes(section) || typeof collapsed !== 'boolean') return Promise.resolve(false);
        const sections = new Set(this._getCollapsedCommandCenterSections());
        if (collapsed) sections.add(section);
        else sections.delete(section);
        return this._context.globalState.update('headroom.commandCenter.collapsedSections', [...sections]);
    }
    async _answerDirectorQuestion() {
        return answerDirectorQuestion({
            database: this._databaseConnection.database,
            refresh: () => {
                this._commandCenter?.refresh();
                this._refreshStatusViews();
            },
        });
    }
    async _manageAgentLifecycle() {
        await manageAgentLifecycle({ database: this._databaseConnection.database,
            refresh: () => this._commandCenter?.refresh(), refreshStatus: this._refreshStatusViews });
    }
    async _readOperationalHealth() {
        const database = this._databaseConnection.database;
        const queueRepository = new ExecutionQueueRepository(database);
        return readOperationalHealth({
            database: () => diagnoseDatabaseIntegrity(database),
            queue: () => ({ queued: queueRepository.listByState('QUEUED').length,
                claimed: queueRepository.listByState('CLAIMED').length }),
            provider: async () => this._providerHealth(),
            verification: () => ({ status: 'NOT_RUN', detail: 'No verification result is currently recorded.' }),
        });
    }
    _readCurrentWork() {
        return {
            activePhase: '',
            detail: this._executionControl.status === 'PAUSED' ? 'Execution is currently paused.' : '',
        };
    }
    async _openObjectiveAction(title) {
        const objectiveRepository = new ObjectiveRepository(this._databaseConnection.database);
        const objective = typeof title === 'string'
            ? objectiveRepository.list().find((item) => item.title === title)
            : undefined;
        if (objective) {
            await this._analyzeObjective();
        } else {
            await vscode.commands.executeCommand(COMMANDS.ANALYZE_OBJECTIVE);
        }
    }
    async _openTaskAction(title) {
        const taskRepository = new TaskRepository(this._databaseConnection.database);
        const task = typeof title === 'string'
            ? taskRepository.list().find((item) => item.title === title)
            : undefined;
        if (task?.id) {
            await vscode.commands.executeCommand(COMMANDS.SHOW_TASK_EXECUTION_REPORT, { taskId: task.id });
        } else {
            await vscode.commands.executeCommand(COMMANDS.SHOW_TASK_EXECUTION_REPORT);
        }
    }
    async _inspectHealthAction() {
        const health = await this._readOperationalHealth();
        const summary = health.map((item) => `${item.label}: ${item.status}`).join(', ');
        vscode.window.showInformationMessage(`HEADROOM Operational Health: ${summary}`);
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
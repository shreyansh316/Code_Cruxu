import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { AgentRole, TaskStatus } from '../constants';
import { isAgentAvailable } from '../domain';
import { createBoundedAIProvider, DEFAULT_AI_REQUEST_BUDGET, createExecutionQueueUseCase,
    createOrganizationalTaskMemoryProvider, createSelectedTaskExecution, createStructuredEmployeeRuntime,
    createTaskExecutionFailureRecovery, createTaskExecutionLifecycle, createTaskResultSubmissionUseCase } from '../application';
import { createAIUsageRecorder, createCommandRunner, createGeminiAIProviderAdapter, createPersistedTaskToolsProvider,
    createSqliteUnitOfWork, createWorkspaceFileAdapter, SqliteEventBus } from '../infrastructure';
import { createSecretStorageAdapter } from '../infrastructure/SecretStorageAdapter';
import { normalizeTaskToolPermissions } from '../shared/taskToolPermissions';
import { createWorkspaceFingerprint } from '../shared/workspaceFingerprint';
import { AgentRepository, AIUsageRepository, AuditLogRepository, DepartmentRepository, ExecutionQueueRepository,
    DebuggingSessionRepository, MemoryRepository, ObjectiveRepository, OfficeRepository, OrganizationRepository, ProjectRepository,
    TaskDependencyRepository, TaskRepository } from '../storage';

/** Present one explicitly confirmed, persisted-grant task execution in VS Code. */
export async function executeAssignedTask({ database, context, configuration, executionControl, activity,
    onExecution = () => {}, refresh = () => {}, refreshStatus = () => {} } = {}) {
    if (configuration?.aiProvider !== 'gemini') {
        vscode.window.showInformationMessage('Configure Gemini before running AI employee tasks.');
        return;
    }
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length !== 1 || typeof folders[0]?.uri?.fsPath !== 'string') {
        vscode.window.showErrorMessage('Open exactly one workspace folder before running a task.');
        return;
    }
    let workspaceFingerprint;
    try { workspaceFingerprint = await createWorkspaceFingerprint(folders[0].uri.fsPath); }
    catch {
        vscode.window.showErrorMessage('The active workspace could not be identified safely.');
        return;
    }
    const taskRepository = new TaskRepository(database);
    const queueRepository = new ExecutionQueueRepository(database);
    const eligibleTasks = taskRepository.list().filter((task) => [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS].includes(task.status)
        && normalizeTaskToolPermissions(task.toolPermissions)?.workspaceFingerprint === workspaceFingerprint);
    const candidates = eligibleTasks.map((task) => ({ task, queue: queueRepository.getByTaskId(task.id) }))
        .filter(({ queue }) => !queue || ['QUEUED', 'COMPLETED'].includes(queue.state))
        .map(({ task }) => task)
        .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    if (!candidates.length) {
        vscode.window.showInformationMessage('No assigned task with permissions for this workspace is ready to run.');
        return;
    }
    const selected = await vscode.window.showQuickPick(candidates.map((task) => ({
        label: `${task.taskCode} · ${task.title.slice(0, 120)}`, description: `${task.status} · ${task.assigneeId}`, task,
    })), { title: 'Select authorized task to run', ignoreFocusOut: true });
    if (!selected) return;
    const confirmation = await vscode.window.showWarningMessage(
        `Send “${selected.task.title}” and its authorized context to Gemini? HEADROOM may access only its saved grants in “${folders[0].name}”.`,
        { modal: true }, 'Run task');
    if (confirmation !== 'Run task') return;

    const task = taskRepository.getById(selected.task.id);
    const agentRepository = new AgentRepository(database);
    const actor = agentRepository.getById(task?.assigneeId);
    if (!actor || actor.role !== AgentRole.EMPLOYEE || !isAgentAvailable(actor) || !actor.organizationId) {
        vscode.window.showErrorMessage('The selected task assignee is unavailable or has no organization.');
        return;
    }
    const hierarchyProvider = { getSnapshot: () => {
        const offices = new OfficeRepository(database).listByOrganization(actor.organizationId);
        const departments = offices.flatMap((office) => new DepartmentRepository(database).listByOffice(office.id));
        return { organization: new OrganizationRepository(database).getById(actor.organizationId),
        offices, departments, agents: agentRepository.listByOrganization(actor.organizationId) };
    } };
    const workspaceRoot = folders[0].uri.fsPath;
    const idFactory = () => randomUUID();
    const clock = { now: () => new Date() };
    const eventBus = new SqliteEventBus(database);
    const auditRepository = new AuditLogRepository(database);
    const unitOfWork = createSqliteUnitOfWork(database);
    const permissions = normalizeTaskToolPermissions(task.toolPermissions);
    const filesystem = await createWorkspaceFileAdapter({ workspaceRoot, maxFileBytes: configuration.maxWorkspaceFileBytes,
        maxFilesPerScan: configuration.maxWorkspaceFilesPerScan,
        onActivity: activity.observer('workspace', { taskId: task.id, agentId: actor.id }) });
    const processRunner = createCommandRunner({
        allowedCommands: permissions.commands.length ? permissions.commands.map(({ command }) => command) : ['headroom-no-command-grant'],
        maxOutputBytes: configuration.maxProcessOutputBytes,
        onActivity: activity.observer('command', { taskId: task.id, agentId: actor.id }),
    });
    const taskToolsProvider = createPersistedTaskToolsProvider({ workspaceRoot, filesystem, processRunner });
    const memoryContextProvider = createOrganizationalTaskMemoryProvider({ memoryRepository: new MemoryRepository(database),
        agentRepository, taskRepository, projectRepository: new ProjectRepository(database),
        objectiveRepository: new ObjectiveRepository(database), hierarchyProvider });
    const gemini = createGeminiAIProviderAdapter({ credentialStore: createSecretStorageAdapter(context.secrets) });
    const provider = createBoundedAIProvider({ provider: gemini,
        inputTokenCounter: (request, options) => gemini.countInputTokens(request, options),
        usageRecorder: createAIUsageRecorder({ usageRepository: new AIUsageRepository(database),
            provider: configuration.aiProvider, purpose: 'employee-task', agentId: actor.id, taskId: task.id }), defaultBudget: DEFAULT_AI_REQUEST_BUDGET });
    const agentRuntime = createStructuredEmployeeRuntime({ agentRepository, taskRepository, hierarchyProvider,
        taskToolsProvider, memoryContextProvider, provider, model: configuration.defaultModel, idFactory, clock });
    const taskLifecycle = createTaskExecutionLifecycle({ taskRepository, auditRepository, eventPublisher: eventBus,
        unitOfWork, clock, idFactory, debuggingSessionRepository: new DebuggingSessionRepository(database) });
    const resultSubmissionUseCase = createTaskResultSubmissionUseCase({ taskRepository, auditRepository,
        eventPublisher: eventBus, unitOfWork, clock, idFactory, debuggingSessionRepository: new DebuggingSessionRepository(database) });
    const executionFailureRecovery = createTaskExecutionFailureRecovery({ taskRepository, queueRepository, auditRepository,
        eventPublisher: eventBus, unitOfWork, clock, idFactory, debuggingSessionRepository: new DebuggingSessionRepository(database) });
    const queueWorkflow = createExecutionQueueUseCase({ taskRepository,
        dependencyRepository: new TaskDependencyRepository(database), queueRepository, hierarchyProvider,
        auditRepository, eventPublisher: eventBus, unitOfWork, clock, idFactory });
    const session = createSelectedTaskExecution({ taskId: task.id, queueWorkflow, queueRepository,
        agentRuntime, taskLifecycle, resultSubmissionUseCase, executionFailureRecovery, taskRepository,
        executionControl, parallelLimit: 1 });
    onExecution(session);
    try {
        const result = await session.run();
        if (!result.ok) {
            vscode.window.showErrorMessage(`Task execution could not start: ${result.error.message}`);
            return;
        }
        const attempt = result.value.attempts[0];
        if (result.value.taskStatus === TaskStatus.REVIEW) {
            vscode.window.showInformationMessage(`Task ${task.taskCode} finished and is ready for review.`);
        } else if (attempt?.recovery?.outcome === 'RETRY_SCHEDULED') {
            vscode.window.showWarningMessage(`Task ${task.taskCode} failed safely and was queued for its bounded retry.`);
        } else if (attempt?.status === 'CANCELLED') {
            vscode.window.showInformationMessage(`Task ${task.taskCode} was cancelled.`);
        } else {
            vscode.window.showWarningMessage(`Task ${task.taskCode} did not complete (${attempt?.errorCode ?? attempt?.status ?? 'not-started'}).`);
        }
        refresh();
        refreshStatus();
    } finally { onExecution(undefined); }
}

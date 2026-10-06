import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { COMMANDS, TaskStatus } from '../constants';
import { isAgentAvailable } from '../domain';
import { createControlledDebuggingWorkflow, createDebuggingToolAdapter } from '../application';
import { createCommandRunner, createPersistedTaskToolsProvider, createSqliteUnitOfWork,
    createWorkspaceFileAdapter, SqliteEventBus } from '../infrastructure';
import { normalizeTaskToolPermissions } from '../shared/taskToolPermissions';
import { createWorkspaceFingerprint } from '../shared/workspaceFingerprint';
import { AgentRepository, AuditLogRepository, DebuggingSessionRepository, DirectorQuestionRepository,
    ObjectiveRepository, ProjectRepository, TaskRepository } from '../storage';

const DEFAULT_DEBUG_TIME_MS = 300_000;

/** Keep VS Code command registration separate from extension lifecycle orchestration. */
export function registerDebuggingCommands(headroom) {
    const refresh = () => headroom._commandCenter?.refresh();
    const refreshStatus = headroom._refreshStatusViews;
    const database = headroom._databaseConnection.database;
    headroom._addDisposable(vscode.commands.registerCommand(COMMANDS.START_DEBUGGING_SESSION,
        () => startDebuggingSession({ database, refresh, refreshStatus })));
    headroom._addDisposable(vscode.commands.registerCommand(COMMANDS.ADVANCE_DEBUGGING_SESSION,
        () => advanceDebuggingSession({ database, configuration: headroom._configuration, refresh, refreshStatus })));
    headroom._addDisposable(vscode.commands.registerCommand(COMMANDS.STOP_DEBUGGING_SESSION,
        () => stopDebuggingSession({ database, refresh, refreshStatus })));
}

/** Let an assigned employee start one bounded debugging session for this workspace. */
export async function startDebuggingSession({ database, refresh = () => {}, refreshStatus = () => {} } = {}) {
    const workspace = getSingleWorkspace();
    if (!workspace) return;
    let fingerprint;
    try { fingerprint = await createWorkspaceFingerprint(workspace.root); }
    catch { vscode.window.showErrorMessage('The active workspace could not be identified safely.'); return; }
    const tasks = new TaskRepository(database).list().filter((task) => task.status === TaskStatus.IN_PROGRESS
        && normalizeTaskToolPermissions(task.toolPermissions)?.workspaceFingerprint === fingerprint);
    if (!tasks.length) { vscode.window.showInformationMessage('No in-progress task with grants for this workspace is available to debug.'); return; }
    const selected = await vscode.window.showQuickPick(tasks.map((task) => ({
        label: `${task.taskCode} · ${task.title.slice(0, 100)}`, description: task.assigneeId ?? 'Unassigned', task,
    })), { title: 'Start bounded debugging', ignoreFocusOut: true });
    if (!selected) return;
    const taskRepository = new TaskRepository(database);
    const agentRepository = new AgentRepository(database);
    const task = taskRepository.getById(selected.task.id);
    const actor = task?.assigneeId ? agentRepository.getById(task.assigneeId) : undefined;
    if (!task || task.status !== TaskStatus.IN_PROGRESS || !actor || actor.role !== 'EMPLOYEE' || !isAgentAvailable(actor)) {
        vscode.window.showErrorMessage('The task assignee is unavailable or the task is no longer active.'); return;
    }
    const answer = await vscode.window.showWarningMessage(`Start a bounded debugging session for “${task.title}”? Actions remain limited to this task’s saved workspace grants.`,
        { modal: true }, 'Start debugging');
    if (answer !== 'Start debugging') return;
    const repositories = debuggingRepositories(database);
    const workflow = createWorkflow({ database, ...repositories, taskRepository, agentRepository });
    const requestedTimeBudget = task.timeBudgetMs == null ? DEFAULT_DEBUG_TIME_MS : task.timeBudgetMs;
    const requestedTokenBudget = task.tokenBudget == null ? 12_000 : task.tokenBudget;
    if (!Number.isFinite(requestedTimeBudget) || requestedTimeBudget < 1000
        || !Number.isSafeInteger(requestedTokenBudget) || requestedTokenBudget < 1) {
        vscode.window.showErrorMessage('The task has insufficient remaining time or token budget for a debugging session.'); return;
    }
    const result = await workflow.start.run({ taskId: task.id, actorId: actor.id, actorRole: actor.role, confirm: true,
        maxAttempts: 3, fileBudget: 10, commandBudget: Math.max(1, Math.min(10, normalizeTaskToolPermissions(task.toolPermissions)?.commands.length ?? 1)),
        tokenBudget: Math.min(50_000, requestedTokenBudget),
        timeBudgetMs: Math.min(900_000, requestedTimeBudget) });
    if (!result.ok) { vscode.window.showErrorMessage(`HEADROOM could not start debugging: ${result.error.message}`); return; }
    vscode.window.showInformationMessage(`Debugging session ${result.value.id} started at ${result.value.stage}. Run “HEADROOM: Advance Debugging” to continue.`);
    refresh(); refreshStatus();
}

/** Advance exactly one active session stage with explicit UI confirmation for process and patch actions. */
export async function advanceDebuggingSession({ database, configuration, refresh = () => {}, refreshStatus = () => {} } = {}) {
    const workspace = getSingleWorkspace();
    if (!workspace) return;
    let fingerprint;
    try { fingerprint = await createWorkspaceFingerprint(workspace.root); }
    catch { vscode.window.showErrorMessage('The active workspace could not be identified safely.'); return; }
    const taskRepository = new TaskRepository(database);
    const agentRepository = new AgentRepository(database);
    const repositories = debuggingRepositories(database);
    const candidates = repositories.sessionRepository.listByTask
        ? taskRepository.list().flatMap((task) => repositories.sessionRepository.listByTask(task.id)
            .filter((session) => session.status === 'ACTIVE' && normalizeTaskToolPermissions(task.toolPermissions)?.workspaceFingerprint === fingerprint)
            .map((session) => ({ task, session }))) : [];
    if (!candidates.length) { vscode.window.showInformationMessage('No active debugging session is available for this workspace.'); return; }
    const selected = await vscode.window.showQuickPick(candidates.map(({ task, session }) => ({
        label: `${task.taskCode} · ${session.stage}`, description: task.title.slice(0, 100), task, session,
    })), { title: 'Advance debugging session', ignoreFocusOut: true });
    if (!selected) return;
    const { task, session } = selected;
    const actor = task.assigneeId ? agentRepository.getById(task.assigneeId) : undefined;
    if (!actor || !isAgentAvailable(actor) || task.status !== TaskStatus.IN_PROGRESS) {
        vscode.window.showErrorMessage('The assigned employee or task is no longer available.'); return;
    }
    const provider = await createTaskToolsProvider(workspace.root, task, configuration);
    const workflow = createWorkflow({ database, ...repositories, taskRepository, agentRepository });
    const adapter = createDebuggingToolAdapter({ sessionRepository: repositories.sessionRepository, taskRepository,
        agentRepository, taskToolsProvider: provider, debuggingWorkflow: workflow });
    const permissions = normalizeTaskToolPermissions(task.toolPermissions);
    let result;
    if (['INSPECT', 'REVIEW'].includes(session.stage)) {
        const file = await choose('Select a granted read file', permissions?.readFiles ?? []);
        if (!file) return;
        result = await adapter.run({ sessionId: session.id, actorId: actor.id, file });
    } else if (['REPRODUCE', 'TEST_HYPOTHESIS', 'TEST', 'VERIFY'].includes(session.stage)) {
        const command = await choose('Select an exact granted command and argument list', (permissions?.commands ?? [])
            .map((grant) => ({ label: grant.command, description: grant.args.join(' '), grant })));
        if (!command) return;
        const confirmation = await vscode.window.showWarningMessage(`Run ${command.grant.command} ${command.grant.args.join(' ')} for ${session.stage}?`,
            { modal: true }, 'Run command');
        if (confirmation !== 'Run command') return;
        result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
            title: `HEADROOM ${session.stage.toLowerCase()}`, cancellable: true }, async (_progress, token) => {
            const controller = new AbortController();
            const cancellation = token.onCancellationRequested(() => controller.abort());
            try {
                return await adapter.run({ sessionId: session.id, actorId: actor.id, command: command.grant.command,
                    args: command.grant.args, signal: controller.signal });
            } finally { cancellation.dispose(); }
        });
    } else if (session.stage === 'PATCH') {
        const file = await choose('Select a granted write file', permissions?.writeFiles ?? []);
        if (!file) return;
        const document = await vscode.workspace.openTextDocument({ language: 'plaintext', content: '' });
        await vscode.window.showTextDocument(document, { preview: false });
        const ready = await vscode.window.showInformationMessage(`Enter complete replacement contents for ${file} in the untitled editor, then continue.`, 'Continue');
        if (ready !== 'Continue') return;
        const contents = document.getText();
        const confirmation = await vscode.window.showWarningMessage(`Replace ${file} with the entered contents?`,
            { modal: true }, 'Apply patch');
        if (confirmation !== 'Apply patch') return;
        result = await adapter.run({ sessionId: session.id, actorId: actor.id, file, contents, confirmPatch: true });
    } else if (session.stage === 'HYPOTHESIS') {
        const hypothesis = await vscode.window.showInputBox({ title: 'Debugging hypothesis', prompt: 'State the cause that the next test will evaluate.', ignoreFocusOut: true });
        if (hypothesis === undefined) return;
        const confidenceText = await vscode.window.showInputBox({ title: 'Hypothesis confidence', prompt: 'Enter confidence from 0 to 1.', validateInput: (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1 ? undefined : 'Enter a number between 0 and 1.' });
        if (confidenceText === undefined) return;
        result = await workflow.recordStep.run({ sessionId: session.id, actorId: actor.id, actorRole: actor.role,
            stage: session.stage, outcome: 'PASS', summary: hypothesis, confidence: Number(confidenceText), files: [],
            toolAction: 'RECORD_HYPOTHESIS' });
    }
    if (!result?.ok) {
        vscode.window.showErrorMessage(`HEADROOM could not advance debugging: ${result?.error?.message ?? 'unsupported session stage'}`);
        return;
    }
    const output = result.value.action?.output;
    if (output) {
        const document = await vscode.workspace.openTextDocument({ language: 'plaintext', content: output });
        await vscode.window.showTextDocument(document, { preview: false });
    }
    const updated = repositories.sessionRepository.getById(session.id);
    vscode.window.showInformationMessage(updated.status === 'RESOLVED'
        ? `Debugging session ${session.id} verified successfully.`
        : updated.status === 'ESCALATED' ? `Debugging session ${session.id} escalated. Review the pending Director question.`
            : updated.status === 'STOPPED' ? `Debugging session ${session.id} stopped (${updated.stopReason}).`
                : `Debugging session ${session.id} advanced to ${updated.stage}.`);
    refresh(); refreshStatus();
}

/** Stop one active debugging session while retaining its complete evidence history. */
export async function stopDebuggingSession({ database, refresh = () => {}, refreshStatus = () => {} } = {}) {
    const workspace = getSingleWorkspace();
    if (!workspace) return;
    let fingerprint;
    try { fingerprint = await createWorkspaceFingerprint(workspace.root); }
    catch { vscode.window.showErrorMessage('The active workspace could not be identified safely.'); return; }
    const taskRepository = new TaskRepository(database);
    const tasks = taskRepository.list();
    const sessions = debuggingRepositories(database).sessionRepository;
    const candidates = tasks.flatMap((task) => sessions.listByTask(task.id)
        .filter((session) => session.status === 'ACTIVE'
            && normalizeTaskToolPermissions(task.toolPermissions)?.workspaceFingerprint === fingerprint)
        .map((session) => ({ task, session })));
    if (!candidates.length) { vscode.window.showInformationMessage('No active debugging session is available to stop.'); return; }
    const selected = await vscode.window.showQuickPick(candidates.map(({ task, session }) => ({
        label: `${task.taskCode} · ${session.stage}`, description: task.title.slice(0, 100), task, session,
    })), { title: 'Stop debugging session', ignoreFocusOut: true });
    if (!selected) return;
    const actor = selected.task.assigneeId ? new AgentRepository(database).getById(selected.task.assigneeId) : undefined;
    if (!actor || !isAgentAvailable(actor) || selected.task.status !== TaskStatus.IN_PROGRESS) {
        vscode.window.showErrorMessage('The assigned employee or task is no longer available.'); return;
    }
    const summary = await vscode.window.showInputBox({ title: 'Stop debugging', prompt: 'Why is this session being stopped?', ignoreFocusOut: true });
    if (summary === undefined) return;
    const confirmation = await vscode.window.showWarningMessage(`Stop debugging session ${selected.session.id}? Its recorded evidence will be retained.`,
        { modal: true }, 'Stop session');
    if (confirmation !== 'Stop session') return;
    const workflow = createWorkflow({ database, ...debuggingRepositories(database), taskRepository,
        agentRepository: new AgentRepository(database) });
    const result = await workflow.stop.run({ sessionId: selected.session.id, actorId: actor.id, actorRole: actor.role,
        reason: 'user-requested', summary });
    if (!result.ok) { vscode.window.showErrorMessage(`HEADROOM could not stop debugging: ${result.error.message}`); return; }
    vscode.window.showInformationMessage(`Debugging session ${selected.session.id} stopped. Its steps remain available for review.`);
    refresh(); refreshStatus();
}

function debuggingRepositories(database) {
    return { sessionRepository: new DebuggingSessionRepository(database),
        auditRepository: new AuditLogRepository(database), eventPublisher: new SqliteEventBus(database),
        projectRepository: new ProjectRepository(database), objectiveRepository: new ObjectiveRepository(database),
        questionRepository: new DirectorQuestionRepository(database) };
}

function createWorkflow({ database, sessionRepository, auditRepository, eventPublisher, projectRepository,
    objectiveRepository, questionRepository, taskRepository, agentRepository }) {
    return createControlledDebuggingWorkflow({ sessionRepository, taskRepository, agentRepository, auditRepository,
        eventPublisher, projectRepository, objectiveRepository, questionRepository,
        unitOfWork: createSqliteUnitOfWork(database),
        authorize: ({ actor, task }) => taskRepository.getById(task.id)?.assigneeId === actor.id,
        idFactory: () => randomUUID() });
}

async function createTaskToolsProvider(workspaceRoot, task, configuration) {
    const permissions = normalizeTaskToolPermissions(task.toolPermissions);
    const filesystem = await createWorkspaceFileAdapter({ workspaceRoot,
        maxFileBytes: configuration.maxWorkspaceFileBytes, maxFilesPerScan: configuration.maxWorkspaceFilesPerScan });
    const processRunner = createCommandRunner({
        allowedCommands: permissions.commands.length ? permissions.commands.map(({ command }) => command) : ['headroom-no-command-grant'],
        maxOutputBytes: configuration.maxProcessOutputBytes,
    });
    return createPersistedTaskToolsProvider({ workspaceRoot, filesystem, processRunner });
}

function getSingleWorkspace() {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length !== 1 || typeof folders[0]?.uri?.fsPath !== 'string') {
        vscode.window.showErrorMessage('Open exactly one workspace folder before using debugging tools.');
        return undefined;
    }
    return { root: folders[0].uri.fsPath };
}

async function choose(placeHolder, values) {
    const items = values.map((value) => typeof value === 'string'
        ? { label: value, value } : { ...value, value: value.grant ?? value.value });
    if (!items.length) { vscode.window.showInformationMessage('No saved task grant is available for this debugging stage.'); return undefined; }
    return (await vscode.window.showQuickPick(items, { placeHolder, ignoreFocusOut: true }))?.value;
}

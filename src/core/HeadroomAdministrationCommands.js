import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { AgentLifecycleStatus, AgentRole, TaskStatus } from '../constants';
import { isAgentAvailable } from '../domain';
import { AgentRepository, AuditLogRepository, DepartmentRepository, EngineeringDecisionRepository,
    ExecutionQueueRepository, ObjectiveRepository, OfficeRepository, OrganizationRepository,
    ProjectRepository, TaskRepository } from '../storage';
import { createAgentLifecycleManagement } from '../application/agentLifecycleManagement';
import { createEngineeringDecisionUseCase } from '../application/engineeringDecision';
import { createDecisionRecallUseCase } from '../application/decisionRecall';
import { createTaskToolPermissionManagement } from '../application/taskToolPermissionManagement';
import { createSqliteUnitOfWork } from '../infrastructure';
import { createWorkspaceFingerprint } from '../shared/workspaceFingerprint';
import { getMessage } from './messages';
import { redactSecrets } from '../shared/redactSecrets';

export async function showEngineeringDecisions({ database, taskId } = {}) {
    const tasks = new TaskRepository(database).list();
    let selectedTask = typeof taskId === 'string' ? tasks.find((task) => task.id === taskId) : undefined;
    if (!selectedTask) {
        const items = tasks.slice(0, 200).map((task) => ({ label: `${task.taskCode} — ${task.title}`,
            description: task.status, task }));
        if (items.length === 0) {
            vscode.window.showInformationMessage('No tasks are available to search for engineering decisions.');
            return;
        }
        const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Choose a task to inspect its recorded engineering decisions' });
        selectedTask = picked?.task;
    }
    if (!selectedTask) return;
    const records = new EngineeringDecisionRepository(database).listByTask(selectedTask.id);
    if (records.length === 0) {
        vscode.window.showInformationMessage(`No engineering decisions are recorded for ${selectedTask.taskCode}.`);
        return;
    }
    const document = await vscode.workspace.openTextDocument({ language: 'json',
        content: JSON.stringify({ taskId: selectedTask.id, taskCode: selectedTask.taskCode, decisions: records }, null, 2) });
    await vscode.window.showTextDocument(document, { preview: false });
}

/** Search immutable decision evidence inside an explicitly selected organization. */
export async function recallEngineeringDecisions({ database } = {}) {
    if (!database) throw new TypeError('Decision recall requires the active HEADROOM database.');
    const organizationRepository = new OrganizationRepository(database);
    const agentRepository = new AgentRepository(database);
    const organizations = organizationRepository.list().map((organization) => ({ organization,
        ceo: agentRepository.listByOrganization(organization.id)
            .filter((agent) => agent.role === AgentRole.CEO && isAgentAvailable(agent))
            .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0] }))
        .filter(({ ceo }) => ceo).sort((a, b) => a.organization.name.localeCompare(b.organization.name)
            || a.organization.id.localeCompare(b.organization.id));
    if (!organizations.length) {
        vscode.window.showInformationMessage('Decision recall requires an organization with an available CEO.');
        return;
    }
    const selection = await vscode.window.showQuickPick(organizations.map(({ organization, ceo }) => ({
        label: organization.name, description: `CEO: ${ceo.name}`, organizationId: organization.id, actorId: ceo.id,
    })), { title: 'Choose organization for decision recall', ignoreFocusOut: true });
    if (!selection) return;
    const query = await vscode.window.showInputBox({ title: 'Recall engineering decisions',
        prompt: 'Search recorded decision context, reasons, selected options, and task titles (2–200 characters).',
        ignoreFocusOut: true, validateInput: (value) => typeof value === 'string' && value.trim().length >= 2 && value.length <= 200
            ? undefined : 'Enter between 2 and 200 characters.' });
    if (query === undefined) return;
    const decisions = new EngineeringDecisionRepository(database);
    const recall = createDecisionRecallUseCase({ decisionRepository: decisions,
        authorize: ({ actorId, organizationId }) => {
            const actor = agentRepository.getById(actorId);
            const organization = organizationRepository.getById(organizationId);
            return Boolean(actor && organization && actor.role === AgentRole.CEO && isAgentAvailable(actor)
                && actor.organizationId === organization.id && actor.id === selection.actorId
                && organization.id === selection.organizationId);
        } });
    const result = await recall.run({ actorId: selection.actorId, organizationId: selection.organizationId, query, limit: 20 });
    if (!result.ok) {
        vscode.window.showErrorMessage(`Decision recall failed: ${result.error.message}`);
        return;
    }
    if (!result.value.length) {
        vscode.window.showInformationMessage(`No recorded decisions matched “${redactSecrets(query.trim(), 200)}” in ${redactSecrets(selection.label, 160)}.`);
        return result.value;
    }
    const authors = new Map();
    const lineage = new Map();
    for (const record of result.value) {
        if (!authors.has(record.authorId)) authors.set(record.authorId, agentRepository.getById(record.authorId));
        for (const link of decisions.listLinks(record.id, { limit: 20 })) lineage.set(link.id, link);
        if (lineage.size >= 100) break;
    }
    const lines = [`# Engineering decision recall: ${redactSecrets(query.trim(), 200)}`, '',
        `Organization: ${redactSecrets(selection.label, 160)} (${selection.organizationId})`,
        `Matched ${result.value.length} of at most 20 records.`, ''];
    for (const record of result.value) {
        const author = authors.get(record.authorId);
        lines.push(`## ${redactSecrets(record.taskTitle, 240)} · ${record.id}`, '',
            `- Author: ${redactSecrets(author?.name ?? record.authorId, 120)} (${author?.role ?? 'unknown'})`,
            `- Selected: ${record.selectedOption}`, `- Rejected: ${record.rejectedOptions.join('; ') || 'None recorded'}`,
            `- Reason: ${record.reason}`, `- Trade-offs: ${record.tradeOffs.join('; ') || 'None recorded'}`,
            `- Evidence: ${record.evidence.join('; ') || 'None recorded'}`, `- Confidence: ${record.confidence} (recorded)`,
            `- Context: ${record.context}`, '');
    }
    lines.push('## Decision lineage', '');
    if (!lineage.size) lines.push('No lineage links found for the matched decisions.');
    else for (const link of lineage.values()) lines.push(`- ${link.relationship}: ${link.sourceDecisionId} → ${link.targetDecisionId}`);
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n').slice(0, 100_000) });
    await vscode.window.showTextDocument(document, { preview: false });
    return result.value;
}

export async function configureTaskToolPermissions({ database, refresh = () => {}, refreshStatus = () => {} } = {}) {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length !== 1 || typeof folders[0]?.uri?.fsPath !== 'string') {
        vscode.window.showErrorMessage('Open exactly one workspace folder before configuring task permissions.');
        return;
    }
    let workspaceFingerprint;
    try { workspaceFingerprint = await createWorkspaceFingerprint(folders[0].uri.fsPath); }
    catch {
        vscode.window.showErrorMessage('The active workspace could not be identified safely.');
        return;
    }
    const tasks = new TaskRepository(database).list().filter((task) => [TaskStatus.CREATED, TaskStatus.ASSIGNED].includes(task.status))
        .map((task) => {
            const project = task.projectId ? new ProjectRepository(database).getById(task.projectId) : undefined;
            const objective = project?.objectiveId ? new ObjectiveRepository(database).getById(project.objectiveId) : undefined;
            return objective?.organizationId ? { task, objective } : undefined;
        }).filter(Boolean).sort((a, b) => a.task.title.localeCompare(b.task.title) || a.task.id.localeCompare(b.task.id));
    if (!tasks.length) {
        vscode.window.showInformationMessage('No unqueued task linked to an organization objective is available for permission setup.');
        return;
    }
    const selected = await vscode.window.showQuickPick(tasks.map(({ task, objective }) => ({
        label: `${task.taskCode} · ${task.title.slice(0, 120)}`, description: objective.title.slice(0, 120), task, objective,
    })), { title: 'Select task to authorize', ignoreFocusOut: true });
    if (!selected) return;
    const organizationId = selected.objective.organizationId;
    const agentRepository = new AgentRepository(database);
    const ceos = agentRepository.listByOrganization(organizationId)
        .filter((agent) => agent.role === AgentRole.CEO && isAgentAvailable(agent))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (!ceos.length) {
        vscode.window.showErrorMessage('Task permissions require an active CEO in the task objective organization.');
        return;
    }
    const actor = ceos.length === 1 ? ceos[0] : (await vscode.window.showQuickPick(ceos.map((agent) => ({
        label: agent.name, description: agent.id, agent,
    })), { title: 'Select approving CEO', ignoreFocusOut: true }))?.agent;
    if (!actor) return;
    const raw = await vscode.window.showInputBox({ title: 'Task tool permission manifest',
        prompt: 'Enter JSON with readFiles, writeFiles, and commands. Paths are workspace-relative; commands require exact executable and argument grants.',
        value: JSON.stringify({ readFiles: [], writeFiles: [], commands: [] }), ignoreFocusOut: true,
        validateInput: (value) => {
            try {
                const parsed = JSON.parse(value);
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? undefined : 'Enter a JSON object.';
            } catch { return 'Enter valid JSON.'; }
        } });
    if (raw === undefined) return;
    const confirmation = await vscode.window.showWarningMessage(
        `Save tool permissions for “${selected.task.title}” in workspace “${folders[0].name}”? Grants are immutable after queueing.`,
        { modal: true }, 'Save permissions');
    if (confirmation !== 'Save permissions') return;
    const hierarchyProvider = { getSnapshot: () => {
        const organization = new OrganizationRepository(database).getById(organizationId);
        const offices = new OfficeRepository(database).listByOrganization(organizationId);
        const departments = offices.flatMap((office) => new DepartmentRepository(database).listByOffice(office.id));
        return { organization, offices, departments, agents: agentRepository.listByOrganization(organizationId) };
    } };
    const management = createTaskToolPermissionManagement({ taskRepository: new TaskRepository(database),
        projectRepository: new ProjectRepository(database), objectiveRepository: new ObjectiveRepository(database),
        agentRepository, hierarchyProvider, queueRepository: new ExecutionQueueRepository(database),
        auditRepository: new AuditLogRepository(database), unitOfWork: createSqliteUnitOfWork(database),
        clock: { now: () => new Date() }, idFactory: () => randomUUID() });
    const parsed = parsePermissions(raw);
    const permissions = parsed && { ...parsed, workspaceFingerprint };
    const result = await management.run({ taskId: selected.task.id, actorId: actor.id, permissions });
    if (!result.ok) {
        vscode.window.showErrorMessage(`Task permissions were not saved: ${result.error.message}`);
        return;
    }
    refresh();
    refreshStatus();
    vscode.window.showInformationMessage('Task tool permissions were saved and will freeze when queued.');
}

function parsePermissions(value) {
    try { return JSON.parse(value); }
    catch { return null; }
}

export async function recordEngineeringDecision({ database, taskId, refresh = () => {} } = {}) {
    const taskRepository = new TaskRepository(database);
    const tasks = taskRepository.list();
    let selectedTask = typeof taskId === 'string' ? tasks.find((task) => task.id === taskId) : undefined;
    if (!selectedTask) {
        const picked = await vscode.window.showQuickPick(tasks.slice(0, 200).map((task) => ({
            label: `${task.taskCode} — ${task.title}`, description: task.status, task,
        })), { placeHolder: 'Choose the task this engineering decision supports' });
        selectedTask = picked?.task;
    }
    if (!selectedTask) return;
    const participantIds = [...new Set([selectedTask.creatorId, selectedTask.assigneeId].filter(Boolean))];
    const agentRepository = new AgentRepository(database);
    const participants = agentRepository.list().filter((agent) => participantIds.includes(agent.id));
    const authorChoice = await vscode.window.showQuickPick(participants.map((agent) => ({
        label: agent.name, description: agent.role, agent,
    })), { placeHolder: 'Choose the task creator or assignee recording the decision' });
    if (!authorChoice?.agent) return;

    const ask = (prompt, placeholder, allowEmpty = false) => vscode.window.showInputBox({
        prompt, placeHolder: placeholder, ignoreFocusOut: true,
        validateInput: (value) => allowEmpty || value.trim() ? undefined : 'This field is required.',
    });
    const context = await ask('Decision context', 'What problem or constraints led to this decision?');
    if (context === undefined) return;
    const optionsText = await ask('Options considered', 'Enter at least two options, one per line.');
    if (optionsText === undefined) return;
    const options = lines(optionsText);
    if (options.length < 2) {
        vscode.window.showErrorMessage('Enter at least two distinct options before recording a decision.');
        return;
    }
    const selectedOption = await vscode.window.showQuickPick(options.map((option) => ({ label: option, option })),
        { placeHolder: 'Choose the selected option' });
    if (!selectedOption?.option) return;
    const rejectedText = await ask('Rejected options', 'Optional: rejected options, one per line.', true);
    if (rejectedText === undefined) return;
    const reason = await ask('Reason', 'Why was this option selected?');
    if (reason === undefined) return;
    const tradeOffsText = await ask('Trade-offs', 'Optional: trade-offs, one per line.', true);
    if (tradeOffsText === undefined) return;
    const evidenceText = await ask('Evidence', 'Optional: evidence references, one per line.', true);
    if (evidenceText === undefined) return;
    const confidenceText = await ask('Confidence', 'Enter an author estimate from 0 to 1.');
    if (confidenceText === undefined) return;
    const result = await createEngineeringDecisionUseCase({ decisionRepository: new EngineeringDecisionRepository(database),
        taskRepository, agentRepository, auditRepository: new AuditLogRepository(database),
        unitOfWork: createSqliteUnitOfWork(database), idFactory: () => randomUUID() }).run({
        taskId: selectedTask.id, authorId: authorChoice.agent.id, context, options,
        selectedOption: selectedOption.option, rejectedOptions: lines(rejectedText), reason,
        tradeOffs: lines(tradeOffsText), evidence: lines(evidenceText), confidence: Number(confidenceText),
    });
    if (!result.ok) {
        vscode.window.showErrorMessage(`HEADROOM could not record the decision: ${result.error.message}`);
        return;
    }
    vscode.window.showInformationMessage('HEADROOM engineering decision recorded.');
    refresh();
}

export async function manageAgentLifecycle({ database, refresh = () => {}, refreshStatus = () => {} } = {}) {
    const organizationRepository = new OrganizationRepository(database);
    const agentRepository = new AgentRepository(database);
    const organizations = organizationRepository.list().sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (!organizations.length) {
        vscode.window.showInformationMessage(getMessage('lifecycle.noOrganizations'));
        return;
    }
    const selectedOrganization = await vscode.window.showQuickPick(organizations.map((organization) => ({
        label: organization.name, description: organization.id, organization,
    })), { title: getMessage('lifecycle.pickOrganization'), ignoreFocusOut: true });
    if (!selectedOrganization) return;
    const organization = selectedOrganization.organization;
    const officeRepository = new OfficeRepository(database);
    const departmentRepository = new DepartmentRepository(database);
    const offices = officeRepository.listByOrganization(organization.id);
    const officeIds = new Set(offices.map(({ id }) => id));
    const departments = offices.flatMap((office) => departmentRepository.listByOffice(office.id));
    const departmentIds = new Set(departments.map(({ id }) => id));
    const allAgents = agentRepository.listByOrganization(organization.id);
    const organizationAgents = allAgents.filter((agent) =>
        (agent.role === AgentRole.HEAD_MANAGER && officeIds.has(agent.managedOfficeId))
        || (agent.role === AgentRole.DEPT_MANAGER && departmentIds.has(agent.managedDepartmentId))
        || (agent.role === AgentRole.EMPLOYEE && departmentIds.has(agent.departmentId))
        || ([AgentRole.CEO, AgentRole.DIRECTOR].includes(agent.role) && agent.organizationId === organization.id));
    const ceos = organizationAgents.filter((agent) => agent.role === AgentRole.CEO && isAgentAvailable(agent));
    if (!ceos.length) {
        vscode.window.showErrorMessage(getMessage('lifecycle.noActiveCEO'));
        return;
    }
    let actor = ceos[0];
    if (ceos.length > 1) {
        const selectedCEO = await vscode.window.showQuickPick(ceos.map((agent) => ({
            label: agent.name, description: getMessage('lifecycle.ceoDescription'), agent,
        })), { title: getMessage('lifecycle.pickCEO'), ignoreFocusOut: true });
        if (!selectedCEO) return;
        actor = selectedCEO.agent;
    }
    const candidates = organizationAgents.filter((agent) => agent.role !== AgentRole.CEO
        && (agent.lifecycleStatus ?? AgentLifecycleStatus.ACTIVE) !== AgentLifecycleStatus.RETIRED)
        .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    if (!candidates.length) {
        vscode.window.showInformationMessage(getMessage('lifecycle.noTargets'));
        return;
    }
    const selectedTarget = await vscode.window.showQuickPick(candidates.map((agent) => ({
        label: agent.name, description: `${agent.role} · ${agent.status} · ${agent.lifecycleStatus ?? AgentLifecycleStatus.ACTIVE}`,
        agent,
    })), { title: getMessage('lifecycle.pickTarget'), ignoreFocusOut: true });
    if (!selectedTarget) return;
    const target = selectedTarget.agent;
    const current = target.lifecycleStatus ?? AgentLifecycleStatus.ACTIVE;
    const transitions = current === AgentLifecycleStatus.ACTIVE
        ? [AgentLifecycleStatus.SUSPENDED, AgentLifecycleStatus.RETIRED]
        : [AgentLifecycleStatus.ACTIVE, AgentLifecycleStatus.RETIRED];
    const action = await vscode.window.showQuickPick(transitions.map((lifecycleStatus) => ({
        label: getMessage(`lifecycle.action.${lifecycleStatus}`), lifecycleStatus,
    })), { title: getMessage('lifecycle.pickAction'), ignoreFocusOut: true });
    if (!action) return;
    const reason = await vscode.window.showInputBox({
        title: getMessage('lifecycle.reason.title'), prompt: getMessage('lifecycle.reason.prompt'), ignoreFocusOut: true,
        validateInput: (value) => typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 1000
            ? undefined : getMessage('lifecycle.reason.invalid'),
    });
    if (reason === undefined) return;
    const workflow = createAgentLifecycleManagement({
        agentRepository, hierarchyProvider: { getSnapshot: () => ({ organization, offices, departments, agents: organizationAgents }) },
        auditRepository: new AuditLogRepository(database), unitOfWork: createSqliteUnitOfWork(database),
        clock: { now: () => new Date() }, idFactory: () => randomUUID(),
    });
    const result = await workflow.run({ actorId: actor.id, agentId: target.id,
        lifecycleStatus: action.lifecycleStatus, reason });
    if (!result.ok) {
        vscode.window.showErrorMessage(getMessage('lifecycle.failed', { error: result.error.message }));
        return;
    }
    refresh();
    refreshStatus();
    vscode.window.showInformationMessage(getMessage('lifecycle.updated', {
        name: target.name, status: result.value.lifecycleStatus,
    }));
}

function lines(value) {
    return typeof value === 'string' ? value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [];
}

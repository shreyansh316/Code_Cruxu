import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { AgentRole } from '../constants';
import { isAgentAvailable } from '../domain';
import { createPersistReviewFindingsUseCase } from '../application/persistReviewFindings';
import { createSqliteUnitOfWork } from '../infrastructure';
import { AgentRepository, AuditLogRepository, MemoryRepository, ObjectiveRepository,
    OrganizationRepository, ProjectRepository, TaskRepository } from '../storage';

/** Save a validated review JSON document as explicitly approved, unverified task memory. */
export async function saveReviewFindingsFromEditor({ database } = {}) {
    const editor = vscode.window.activeTextEditor;
    if (!database || !editor) {
        vscode.window.showInformationMessage('Open the engineering review JSON document before saving review findings.');
        return;
    }
    let review;
    try {
        const text = editor.document.getText();
        if (Buffer.byteLength(text, 'utf8') > 32 * 1024) throw new Error('oversized');
        review = JSON.parse(text);
        if (!review || !Array.isArray(review.findings) || !Array.isArray(review.evidence)) throw new Error('invalid');
    } catch {
        vscode.window.showErrorMessage('The active document is not a bounded engineering review with cited findings.');
        return;
    }
    if (!review.findings.length) {
        vscode.window.showInformationMessage('This review has no concrete findings to save.');
        return [];
    }

    const tasks = new TaskRepository(database).list().slice(0, 200);
    if (!tasks.length) {
        vscode.window.showInformationMessage('Create a task before saving review findings to task memory.');
        return;
    }
    const pickedTask = await vscode.window.showQuickPick(tasks.map((task) => ({
        label: `${task.taskCode} — ${task.title}`, description: task.status, task,
    })), { title: 'Choose the task these findings apply to', ignoreFocusOut: true });
    if (!pickedTask) return;
    const task = pickedTask.task;

    const project = new ProjectRepository(database).getById(task.projectId);
    const objective = project?.objectiveId ? new ObjectiveRepository(database).getById(project.objectiveId) : undefined;
    const organizationId = objective?.organizationId;
    if (!organizationId || !new OrganizationRepository(database).getById(organizationId)) {
        vscode.window.showErrorMessage('The selected task must belong to an organization before findings can be saved.');
        return;
    }
    const agents = new AgentRepository(database);
    const reviewers = agents.listByOrganization(organizationId)
        .filter((agent) => agent.role === AgentRole.CEO && isAgentAvailable(agent));
    if (!reviewers.length) {
        vscode.window.showErrorMessage('An available CEO in the task organization is required to approve saved review findings.');
        return;
    }
    const pickedReviewer = reviewers.length === 1 ? reviewers[0] : (await vscode.window.showQuickPick(
        reviewers.map((agent) => ({ label: agent.name, description: agent.id, agent })),
        { title: 'Choose the available CEO approving this memory', ignoreFocusOut: true }))?.agent;
    if (!pickedReviewer) return;
    const confirm = await vscode.window.showWarningMessage(
        `Save ${review.findings.length} cited finding(s) from “${review.selected}” to task memory for ${task.taskCode} — ${task.title}? They remain unverified until separately reviewed.`,
        { modal: true }, 'Save findings');
    if (confirm !== 'Save findings') return;

    const taskRepository = new TaskRepository(database);
    const projectRepository = new ProjectRepository(database);
    const objectiveRepository = new ObjectiveRepository(database);
    const useCase = createPersistReviewFindingsUseCase({ memoryRepository: new MemoryRepository(database),
        taskRepository, agentRepository: agents, auditRepository: new AuditLogRepository(database),
        unitOfWork: createSqliteUnitOfWork(database), idFactory: () => randomUUID(),
        authorize: ({ actor, task: target }) => {
            const persistedActor = agents.getById(actor.id);
            const persistedTask = taskRepository.getById(target.id);
            const targetProject = persistedTask?.projectId ? projectRepository.getById(persistedTask.projectId) : undefined;
            const targetObjective = targetProject?.objectiveId ? objectiveRepository.getById(targetProject.objectiveId) : undefined;
            return Boolean(persistedActor && persistedActor.id === pickedReviewer.id && persistedActor.role === AgentRole.CEO
                && isAgentAvailable(persistedActor) && persistedActor.organizationId === organizationId
                && persistedTask && persistedTask.id === task.id && targetObjective?.organizationId === organizationId);
        } });
    const result = await useCase.run({ taskId: task.id, actorId: pickedReviewer.id,
        actorRole: AgentRole.CEO, review, confirm: true });
    if (!result.ok) {
        vscode.window.showErrorMessage(`Review findings were not saved: ${result.error.message}`);
        return;
    }
    vscode.window.showInformationMessage(`Saved ${result.value.length} unverified review finding(s) to ${task.taskCode} task memory.`);
    return result.value;
}

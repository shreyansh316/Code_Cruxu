import * as vscode from 'vscode';
import { AgentRole, COMMANDS } from '../constants';
import { createTaskExecutionReport, createTaskUsageSummary } from '../application';
import { AgentRepository, AIUsageRepository, AuditLogRepository, DebuggingSessionRepository,
    ObjectiveRepository, ProjectRepository, TaskRepository } from '../storage';

export function registerUsageCommands(context) {
    context._addDisposable(vscode.commands.registerCommand(COMMANDS.SHOW_TASK_USAGE_SUMMARY, async (task) =>
        await showTaskUsageSummary({ database: context._databaseConnection.database, taskId: taskIdArgument(task) })));
    context._addDisposable(vscode.commands.registerCommand(COMMANDS.SHOW_TASK_EXECUTION_REPORT, async (task) =>
        await showTaskExecutionReport({ database: context._databaseConnection.database, taskId: taskIdArgument(task) })));
}

/** Open a bounded Markdown review of task identity, usage, debugging steps, and audit milestones. */
export async function showTaskExecutionReport({ database, taskId } = {}) {
    if (!database) throw new TypeError('Task execution reporting requires the active HEADROOM database.');
    const taskRepository = new TaskRepository(database);
    let task = taskId ? taskRepository.getById(taskId) : undefined;
    if (taskId && !task) { vscode.window.showErrorMessage('The selected task no longer exists.'); return; }
    if (!task) {
        const candidates = taskRepository.list().sort((a, b) => a.taskCode.localeCompare(b.taskCode));
        if (!candidates.length) { vscode.window.showInformationMessage('No tasks are available for an execution report.'); return; }
        const selected = await vscode.window.showQuickPick(candidates.map((value) => ({
            label: `${value.taskCode} · ${value.title.slice(0, 100)}`,
            description: `${value.status} · ${value.assigneeId ?? 'unassigned'}`, task: value,
        })), { title: 'Review persisted task execution evidence', ignoreFocusOut: true });
        if (!selected) return;
        task = taskRepository.getById(selected.task.id);
    }
    const project = task?.projectId ? new ProjectRepository(database).getById(task.projectId) : undefined;
    const objective = project?.objectiveId ? new ObjectiveRepository(database).getById(project.objectiveId) : undefined;
    if (!task || !objective?.organizationId) {
        vscode.window.showErrorMessage('Execution reports require a task in an organization objective.'); return;
    }
    const actor = new AgentRepository(database).listByOrganization(objective.organizationId)
        .filter((agent) => agent.role === AgentRole.CEO && ['ACTIVE', 'IDLE'].includes(agent.status));
    if (actor.length !== 1) { vscode.window.showErrorMessage('Execution reports require exactly one available CEO in the task organization.'); return; }
    const agentRepository = new AgentRepository(database);
    const report = createTaskExecutionReport({ taskRepository, agentRepository,
        usageRepository: new AIUsageRepository(database), debuggingSessionRepository: new DebuggingSessionRepository(database),
        auditRepository: new AuditLogRepository(database), projectRepository: new ProjectRepository(database),
        objectiveRepository: new ObjectiveRepository(database), authorize: ({ action, actor: persistedActor, task: persistedTask }) =>
            action === 'READ_TASK_EXECUTION_REPORT' && persistedActor.id === actor[0].id
                && persistedActor.role === AgentRole.CEO && persistedTask.id === task.id });
    const result = await report.run({ taskId: task.id, actorId: actor[0].id });
    if (!result.ok) { vscode.window.showErrorMessage('HEADROOM could not authorize this execution report.'); return; }
    const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: formatExecutionReport(result.value) });
    await vscode.window.showTextDocument(document, { preview: false });
    return result.value;
}

/** Show an authorized, compact token/cost/retry report for one persisted task. */
export async function showTaskUsageSummary({ database, taskId } = {}) {
    if (!database) throw new TypeError('Task usage reporting requires the active HEADROOM database.');
    const tasks = new TaskRepository(database);
    let task = taskId ? tasks.getById(taskId) : undefined;
    if (taskId && !task) {
        vscode.window.showErrorMessage('The selected task no longer exists.');
        return;
    }
    if (!task) {
        const candidates = tasks.list().sort((a, b) => a.taskCode.localeCompare(b.taskCode));
        if (!candidates.length) {
            vscode.window.showInformationMessage('No tasks are available for usage reporting.');
            return;
        }
        const selected = await vscode.window.showQuickPick(candidates.map((value) => ({
            label: `${value.taskCode} · ${value.title.slice(0, 100)}`,
            description: `${value.status} · ${value.assigneeId ?? 'unassigned'}`, task: value,
        })), { title: 'Select a task usage report', ignoreFocusOut: true });
        if (!selected) return;
        task = tasks.getById(selected.task.id);
    }
    const project = task?.projectId ? new ProjectRepository(database).getById(task.projectId) : undefined;
    const objective = project?.objectiveId ? new ObjectiveRepository(database).getById(project.objectiveId) : undefined;
    const organizationId = objective?.organizationId;
    if (!task || !organizationId) {
        vscode.window.showErrorMessage('Usage reporting requires the task to belong to an organization objective.');
        return;
    }
    const activeCeo = new AgentRepository(database).listByOrganization(organizationId)
        .filter((agent) => agent.role === AgentRole.CEO && ['ACTIVE', 'IDLE'].includes(agent.status));
    if (activeCeo.length !== 1) {
        vscode.window.showErrorMessage('Usage reporting requires exactly one available CEO in the task organization.');
        return;
    }
    const actor = activeCeo[0];
    const useCase = createTaskUsageSummary({ usageRepository: new AIUsageRepository(database), taskRepository: tasks,
        agentRepository: new AgentRepository(database), authorize: ({ action, actor: persistedActor, task: persistedTask }) =>
            action === 'READ_TASK_USAGE' && persistedActor.id === actor.id && persistedActor.role === AgentRole.CEO
                && persistedTask.id === task.id && objective.organizationId === organizationId });
    const result = await useCase.run({ taskId: task.id, actorId: actor.id });
    if (!result.ok) {
        vscode.window.showErrorMessage('HEADROOM could not authorize this usage report.');
        return;
    }
    const value = result.value;
    if (value.attemptCount === 0) {
        vscode.window.showInformationMessage(`No AI usage has been recorded for ${task.taskCode}.`);
        return value;
    }
    const modelSummary = value.models.map((model) => `${model.provider ?? 'unknown provider'}/${model.model}: ${model.attempts} attempts`).join(' · ');
    const costSummary = value.costComplete ? `estimated $${value.estimatedCost.toFixed(4)}`
        : `partial cost estimate; known subtotal $${value.estimatedCost.toFixed(4)}`;
    const message = `${task.taskCode} usage: ${value.totalTokens.toLocaleString()} tokens `
        + `(${value.inputTokens.toLocaleString()} in / ${value.outputTokens.toLocaleString()} out), `
        + `${value.retryCount} retries, ${value.failureCount} failed attempts, `
        + `${costSummary}, ${(value.durationMs / 1000).toFixed(1)}s. ${modelSummary}`;
    vscode.window.showInformationMessage(message.slice(0, 1800));
    return value;
}

function formatExecutionReport(report) {
    const { task, usage, debugging, audit } = report;
    const lines = [`# ${task.code ?? task.id}: ${task.title}`, '', `- Status: ${task.status}`,
        `- Objective: ${task.objective?.title ?? 'Unknown'} (${task.objective?.id ?? 'no objective id'})`,
        `- Project: ${task.project?.name ?? 'Unknown'} (${task.project?.id ?? 'no project id'})`,
        `- Created by: ${task.createdBy?.name ?? 'Unknown'} (${task.createdBy?.role ?? 'unknown'})`,
        `- Manager: ${task.manager ? `${task.manager.name} (${task.manager.role})` : 'Not identified by persisted role'}`,
        `- Assigned employee: ${task.assignee?.name ?? 'Unassigned'} (${task.assignee?.role ?? 'unknown'}; ${task.assignee?.id ?? 'none'})`,
        `- Blocker: ${task.blockerReason ?? 'None recorded'}`,
        `- Execution duration: ${Number.isSafeInteger(task.executionDurationMs) ? `${task.executionDurationMs} ms` : 'Unknown'}`,
        `- Final result: ${task.result ?? 'No result recorded'}`, '', '## AI usage', '',
        `- Requests: ${usage.requestCount}; attempts: ${usage.attemptCount}; retries: ${usage.retryCount}`,
        `- Tokens: ${usage.totalTokens} (${usage.inputTokens} input, ${usage.outputTokens} output)`,
        `- Cost: ${usage.costComplete ? `estimated $${usage.estimatedCost.toFixed(4)}`
            : `partial; known subtotal $${usage.estimatedCost.toFixed(4)} (${usage.costKnownAttempts}/${usage.attemptCount} attempts priced)`}; provider time: ${usage.durationMs} ms`,
        `- Outcomes: ${usage.successCount} successful, ${usage.failureCount} failed`,
        ...usage.models.map((model) => `- Provider/model ${model.provider ?? 'unknown provider'}/${model.model}: ${model.attempts} attempts, ${model.inputTokens + model.outputTokens} tokens`),
        '', '## Debugging sessions', ''];
    if (!debugging.length) lines.push('No debugging sessions recorded.', '');
    for (const session of debugging) {
        lines.push(`### ${session.status} · ${session.stage} · ${session.id}`,
            `- Employee: ${session.createdBy?.name ?? session.createdBy?.id ?? 'Unknown'}`,
            `- Started: ${session.startedAt}; deadline: ${session.deadlineAt}`,
            `- Stop reason: ${session.stopReason ?? 'none'}`,
            `- Summary: ${session.finalSummary ?? 'No final summary recorded'}`, '');
        for (const step of session.steps) {
            lines.push(`- ${step.sequence}. **${step.stage} — ${step.outcome}** (${step.toolAction ?? 'manual'}; ${step.durationMs} ms)`,
                `  ${step.summary}`, ...(step.commandSummary ? [`  Command: ${step.commandSummary}`] : []),
                ...(step.files.length ? [`  Files: ${step.files.join(', ')}`] : []));
        }
        lines.push('');
    }
    lines.push('## Audit milestones', '');
    if (!audit.length) lines.push('No task audit milestones recorded.');
    else for (const item of audit) {
        const actor = item.actor ? `${item.actor.name} · ${item.actor.role}` : item.actorId ?? 'system';
        const evidence = Object.keys(item.evidence ?? {}).length ? ` — ${JSON.stringify(item.evidence)}` : '';
        lines.push(`- ${item.occurredAt} — ${item.action} by ${actor} (${item.entity})${evidence}`);
    }
    return lines.join('\n').slice(0, 100_000);
}

function taskIdArgument(value) {
    if (typeof value === 'string') return value;
    const id = typeof value?.taskId === 'string' ? value.taskId : value?.id;
    return typeof id === 'string' ? id.replace(/^task:/, '') : undefined;
}

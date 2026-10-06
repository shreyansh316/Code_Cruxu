/** Phase 416 — expose a bounded, attributable task execution report from persisted evidence. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createTaskExecutionReport } from '../src/application';
import { AgentRepository, AIUsageRepository, AuditLogRepository, DebuggingSessionRepository,
    ObjectiveRepository, OrganizationRepository, ProjectRepository, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';
import { showTaskExecutionReport } from '../src/core/HeadroomUsageCommands';

describe('Phase 416 — persisted task execution report', () => {
    let connection; let database; let agents; let taskRepository; let usage; let debugging; let audit;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-416', name: 'Org' });
        agents = new AgentRepository(database);
        agents.create({ id: 'ceo-416', organizationId: 'org-416', name: 'CEO', role: 'CEO' });
        agents.create({ id: 'manager-416', organizationId: 'org-416', name: 'Manager', role: 'DEPT_MANAGER' });
        agents.create({ id: 'employee-416', organizationId: 'org-416', name: 'Engineer', role: 'EMPLOYEE' });
        new ObjectiveRepository(database).create({ id: 'objective-416', organizationId: 'org-416', title: 'Goal', description: 'Work' });
        new ProjectRepository(database).create({ id: 'project-416', objectiveId: 'objective-416', name: 'Project', description: 'Work' });
        taskRepository = new TaskRepository(database);
        taskRepository.create({ id: 'task-416', taskCode: 'PH416-001', projectId: 'project-416', title: 'Investigate',
            creatorId: 'manager-416', assigneeId: 'employee-416', status: 'IN_PROGRESS' });
        usage = new AIUsageRepository(database); debugging = new DebuggingSessionRepository(database); audit = new AuditLogRepository(database);
        usage.record({ id: 'usage-416', requestId: 'request-416', provider: 'gemini', model: 'model', agentId: 'employee-416', taskId: 'task-416',
            inputTokens: 100, outputTokens: 30, estimatedCost: 0.02, durationMs: 500, purpose: 'task execution' });
        debugging.create({ id: 'session-416', taskId: 'task-416', createdByAgentId: 'employee-416',
            startedAt: '2026-10-06T12:00:00.000Z', timeBudgetMs: 60000 });
        debugging.recordStep({ id: 'step-416', sessionId: 'session-416', stage: 'REPRODUCE', outcome: 'PASS',
            summary: 'Test ran', files: ['src/main.js'], commandsRun: 1, durationMs: 100,
            toolAction: 'EXECUTE_COMMAND', commandSummary: 'npm test token=hidden', now: '2026-10-06T12:00:30.000Z' });
        audit.append({ id: 'audit-416', action: 'TASK_EXECUTION_RETRY_SCHEDULED', entity: 'task',
            entityId: 'task-416', actorId: 'employee-416', taskId: 'task-416', details: { token: 'hidden' } });
    });
    afterEach(() => { connection.close(); vi.clearAllMocks(); });

    it('combines task identity, employee, usage, debugging tools, and audit milestones without secrets', async () => {
        const agentRead = vi.spyOn(agents, 'getById');
        const report = createTaskExecutionReport({ taskRepository, agentRepository: agents, usageRepository: usage,
            debuggingSessionRepository: debugging, auditRepository: audit,
            projectRepository: new ProjectRepository(database), objectiveRepository: new ObjectiveRepository(database),
            authorize: ({ action, actor, task }) => action === 'READ_TASK_EXECUTION_REPORT'
                && actor.role === 'CEO' && task.id === 'task-416' });
        const result = await report.run({ taskId: 'task-416', actorId: 'ceo-416' });
        expect(result.ok).toBe(true);
        expect(result.value).toMatchObject({ task: { id: 'task-416', createdBy: { id: 'manager-416', name: 'Manager', role: 'DEPT_MANAGER' },
            manager: { id: 'manager-416', name: 'Manager', role: 'DEPT_MANAGER' },
            objective: { id: 'objective-416', title: 'Goal' },
            project: { id: 'project-416', name: 'Project' }, assignee: { id: 'employee-416', name: 'Engineer' } },
            usage: { totalTokens: 130, estimatedCost: 0.02 },
            debugging: [{ createdBy: { id: 'employee-416', name: 'Engineer' }, steps: [
                { toolAction: 'EXECUTE_COMMAND', commandSummary: 'npm test token=[redacted]', files: ['src/main.js'] },
            ] }], audit: [{ action: 'TASK_EXECUTION_RETRY_SCHEDULED', actorId: 'employee-416',
                actor: { id: 'employee-416', name: 'Engineer', role: 'EMPLOYEE' }, evidence: {} }] });
        expect(JSON.stringify(result.value)).not.toContain('hidden');
        expect(JSON.stringify(result.value)).not.toContain('details');
        expect(agentRead.mock.calls.filter(([id]) => id === 'employee-416')).toHaveLength(1);
    });

    it('does not label a CEO task creator as a manager without a persisted manager role', async () => {
        taskRepository.update('task-416', { creatorId: 'ceo-416' });
        const report = createTaskExecutionReport({ taskRepository, agentRepository: agents, usageRepository: usage,
            debuggingSessionRepository: debugging, auditRepository: audit,
            projectRepository: new ProjectRepository(database), objectiveRepository: new ObjectiveRepository(database),
            authorize: ({ actor }) => actor.role === 'CEO' });
        const result = await report.run({ taskId: 'task-416', actorId: 'ceo-416' });
        expect(result.value.task.createdBy).toMatchObject({ id: 'ceo-416', role: 'CEO' });
        expect(result.value.task.manager).toBeNull();
    });

    it('includes a bounded blocker in the authorized report and redacts credential values', async () => {
        taskRepository.update('task-416', { blockerReason: 'Provider stalled with api_key=ghp_123456789012345678901234567890123456' });
        const report = createTaskExecutionReport({ taskRepository, agentRepository: agents, usageRepository: usage,
            debuggingSessionRepository: debugging, auditRepository: audit,
            projectRepository: new ProjectRepository(database), objectiveRepository: new ObjectiveRepository(database),
            authorize: ({ actor }) => actor.role === 'CEO' });
        const result = await report.run({ taskId: 'task-416', actorId: 'ceo-416' });
        expect(result.value.task.blockerReason).toContain('api_key=[redacted]');
        expect(result.value.task.blockerReason).not.toContain('ghp_123456789012345678901234567890123456');
    });

    it('reports task wall-clock duration separately from provider time', async () => {
        taskRepository.update('task-416', { startedAt: '2026-10-06T12:00:00.000Z' });
        const report = createTaskExecutionReport({ taskRepository, agentRepository: agents, usageRepository: usage,
            debuggingSessionRepository: debugging, auditRepository: audit,
            projectRepository: new ProjectRepository(database), objectiveRepository: new ObjectiveRepository(database),
            clock: { now: () => new Date('2026-10-06T12:01:00.000Z') }, authorize: ({ actor }) => actor.role === 'CEO' });
        let result = await report.run({ taskId: 'task-416', actorId: 'ceo-416' });
        expect(result.value.task.executionDurationMs).toBe(60_000);
        taskRepository.update('task-416', { completedAt: '2026-10-06T12:00:30.000Z' });
        result = await report.run({ taskId: 'task-416', actorId: 'ceo-416' });
        expect(result.value.task.executionDurationMs).toBe(30_000);
        taskRepository.update('task-416', { completedAt: 'invalid timestamp' });
        result = await report.run({ taskId: 'task-416', actorId: 'ceo-416' });
        expect(result.value.task.executionDurationMs).toBeNull();
        taskRepository.update('task-416', { completedAt: '2026-10-06T11:59:59.000Z' });
        result = await report.run({ taskId: 'task-416', actorId: 'ceo-416' });
        expect(result.value.task.executionDurationMs).toBeNull();
    });

    it('rejects a caller unless the report policy authorizes them', async () => {
        const report = createTaskExecutionReport({ taskRepository, agentRepository: agents, usageRepository: usage,
            debuggingSessionRepository: debugging, auditRepository: audit,
            projectRepository: new ProjectRepository(database), objectiveRepository: new ObjectiveRepository(database), authorize: () => false });
        const result = await report.run({ taskId: 'task-416', actorId: 'ceo-416' });
        expect(result.ok).toBe(false);
        expect(result.error.code).toBe('task-report-forbidden');
    });

    it('supports validated newest-first bounded task audit reads', () => {
        audit.append({ id: 'audit-416-newest', action: 'TASK_STATE_CHANGED', entity: 'task', entityId: 'task-416', taskId: 'task-416' });
        expect(audit.listByTask('task-416', { limit: 2, order: 'DESC' }).map((entry) => entry.id))
            .toEqual(['audit-416-newest', 'audit-416']);
        expect(() => audit.listByTask('task-416', { order: 'DESC; DROP TABLE audit_logs' })).toThrow(/order/);
    });

    it('projects retry, blocker, and escalation evidence while excluding arbitrary audit payload fields', async () => {
        audit.append({ id: 'audit-416-retry', action: 'TASK_EXECUTION_RETRY_SCHEDULED', entity: 'task',
            entityId: 'task-416', actorId: 'employee-416', taskId: 'task-416',
            details: { errorCode: 'provider-failed', retryCount: 2, maxRetries: 3, prompt: 'private content', token: 'hidden' } });
        const report = createTaskExecutionReport({ taskRepository, agentRepository: agents, usageRepository: usage,
            debuggingSessionRepository: debugging, auditRepository: audit,
            projectRepository: new ProjectRepository(database), objectiveRepository: new ObjectiveRepository(database),
            authorize: ({ actor }) => actor.role === 'CEO' });
        const result = await report.run({ taskId: 'task-416', actorId: 'ceo-416' });
        expect(result.value.audit.at(-1)).toMatchObject({ action: 'TASK_EXECUTION_RETRY_SCHEDULED',
            evidence: { errorCode: 'provider-failed', retryCount: 2, maxRetries: 3 } });
        expect(JSON.stringify(result.value)).not.toContain('private content');
        expect(JSON.stringify(result.value)).not.toContain('hidden');
    });

    it('opens the persisted evidence report in an editable, keyboard accessible Markdown tab', async () => {
        taskRepository.update('task-416', { blockerReason: 'Execution paused after credential token=sample-secret' });
        await showTaskExecutionReport({ database, taskId: 'task-416' });
        expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(expect.objectContaining({
            language: 'markdown', content: expect.stringContaining('PH416-001: Investigate'),
        }));
        expect(vscode.workspace.openTextDocument.mock.calls[0][0].content).toContain('npm test token=[redacted]');
        expect(vscode.workspace.openTextDocument.mock.calls[0][0].content).toContain('gemini/model');
        expect(vscode.workspace.openTextDocument.mock.calls[0][0].content).toContain('- Objective: Goal (objective-416)');
        expect(vscode.workspace.openTextDocument.mock.calls[0][0].content).toContain('- Created by: Manager (DEPT_MANAGER)');
        expect(vscode.workspace.openTextDocument.mock.calls[0][0].content).toContain('- Manager: Manager (DEPT_MANAGER)');
        expect(vscode.workspace.openTextDocument.mock.calls[0][0].content).toContain('- Blocker: Execution paused after credential token=[redacted]');
        expect(vscode.workspace.openTextDocument.mock.calls[0][0].content).toContain('- Execution duration: Unknown');
        expect(vscode.workspace.openTextDocument.mock.calls[0][0].content).not.toContain('sample-secret');
        expect(vscode.window.showTextDocument).toHaveBeenCalledOnce();
    });
});

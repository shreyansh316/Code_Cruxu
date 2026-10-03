/** Phase 042 — end-to-end application orchestration. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    createExecutionOrchestrator, createExecutionQueueUseCase, createPlanApprovalUseCase,
    createTaskCreationUseCase, createTaskResultSubmissionUseCase, createTaskReviewUseCase,
    createTaskScheduler,
} from '../src/application';
import { AgentRole, ObjectiveStatus, TaskStatus } from '../src/constants';
import { ExecutionControl } from '../src/domain';
import { SqliteEventBus, createSqliteUnitOfWork } from '../src/infrastructure';
import { AgentRepository, AuditLogRepository, ExecutionQueueRepository, ObjectiveRepository,
    OrganizationRepository, ProjectRepository, SqliteConnection, TaskDependencyRepository,
    TaskRepository, applyMigrations } from '../src/storage';

const planDraft = () => ({
    id: 'plan-042', objectiveId: 'objective-042',
    projects: [{ id: 'project-042', name: 'Orchestration project' }],
    milestones: [{ id: 'milestone-042', projectId: 'project-042', title: 'Delivery' }],
    tasks: [{ id: 'task-042', taskCode: 'PH042-001', title: 'Complete objective',
        projectId: 'project-042', milestoneId: 'milestone-042', acceptanceCriteria: [
            { id: 'criterion-042', description: 'Verification succeeds', required: true, met: false },
        ] }],
    dependencies: [],
});

describe('Phase 042 — execution orchestration', () => {
    let connection;
    let database;
    let objectives;
    let projects;
    let tasks;
    let dependencies;
    let queueRepository;
    let agents;
    let audit;
    let events;
    let approvedPlan;
    let orchestrator;
    let nextId;
    let executions;

    beforeEach(async () => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'organization-042', name: 'HEADROOM' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-042', 'organization-042', 'Office', 'office-042');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-042', 'office-042', 'Department', 'department-042');
        agents = new AgentRepository(database);
        agents.create({ id: 'ceo-042', name: 'CEO', role: AgentRole.CEO });
        agents.create({ id: 'manager-042', name: 'Manager', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'department-042' });
        agents.create({ id: 'employee-042', name: 'Employee', role: AgentRole.EMPLOYEE, departmentId: 'department-042' });
        objectives = new ObjectiveRepository(database);
        objectives.create({ id: 'objective-042', title: 'Deliver objective', description: 'End-to-end work', status: ObjectiveStatus.PLANNING });
        projects = new ProjectRepository(database);
        tasks = new TaskRepository(database);
        dependencies = new TaskDependencyRepository(database);
        queueRepository = new ExecutionQueueRepository(database);
        audit = new AuditLogRepository(database);
        events = new SqliteEventBus(database);
        let generated = 0;
        nextId = () => `generated-042-${++generated}`;
        const clock = { now: () => '2026-10-03T12:00:00.000Z' };
        const approval = createPlanApprovalUseCase({ agentRepository: agents, clock });
        approvedPlan = (await approval.run({ plan: planDraft(), approverId: 'ceo-042', decision: 'APPROVED' })).value;
        const hierarchyProvider = { getSnapshot: () => ({
            organization: { id: 'organization-042', name: 'HEADROOM' },
            offices: [{ id: 'office-042', organizationId: 'organization-042', name: 'Office', slug: 'office-042', status: 'ACTIVE' }],
            departments: [{ id: 'department-042', officeId: 'office-042', name: 'Department', slug: 'department-042', status: 'ACTIVE' }],
            agents: agents.list(),
        }) };
        const unitOfWork = createSqliteUnitOfWork(database);
        const taskCreation = createTaskCreationUseCase({ objectiveRepository: objectives, projectRepository: projects,
            taskRepository: tasks, dependencyRepository: dependencies, hierarchyProvider,
            auditRepository: audit, eventPublisher: events, unitOfWork, clock, idFactory: nextId });
        const queueWorkflow = createExecutionQueueUseCase({ taskRepository: tasks, dependencyRepository: dependencies,
            queueRepository, hierarchyProvider, auditRepository: audit, eventPublisher: events,
            unitOfWork, clock, idFactory: nextId });
        executions = 0;
        const scheduler = createTaskScheduler({ queueWorkflow, queueRepository,
            executor: { execute: async () => {
                executions += 1;
                return { summary: `Execution ${executions} passed.`, acceptanceCriteria: [
                    { criterionId: 'criterion-042', met: true, evidence: 'Automated verification passed.' },
                ] };
            } }, executionControl: new ExecutionControl(), parallelLimit: 2 });
        const resultSubmission = createTaskResultSubmissionUseCase({ taskRepository: tasks,
            auditRepository: audit, eventPublisher: events, unitOfWork, clock, idFactory: nextId });
        const review = createTaskReviewUseCase({ taskRepository: tasks, agentRepository: agents, hierarchyProvider,
            auditRepository: audit, eventPublisher: events, unitOfWork, clock, idFactory: nextId });
        orchestrator = createExecutionOrchestrator({ taskCreationUseCase: taskCreation, scheduler,
            resultSubmissionUseCase: resultSubmission, reviewUseCase: review,
            objectiveRepository: objectives, taskRepository: tasks, auditRepository: audit,
            eventPublisher: events, unitOfWork, clock, idFactory: nextId });
    });
    afterEach(() => connection.close());

    const assignments = [{ taskId: 'task-042', creatorId: 'manager-042', assigneeId: 'employee-042' }];

    it('persists objective, task, result, review, terminal state, and an auditable report', async () => {
        const outcome = await orchestrator.run({ plan: approvedPlan, assignments,
            reviewDecisions: [{ taskId: 'task-042', reviewerId: 'manager-042', decision: 'APPROVED' }] });
        expect(outcome.ok).toBe(true);
        expect(outcome.value).toMatchObject({ status: ObjectiveStatus.COMPLETED,
            counts: { completed: 1, failed: 0, reviewPending: 0 } });
        expect(objectives.getById('objective-042').status).toBe(ObjectiveStatus.COMPLETED);
        expect(tasks.getById('task-042').status).toBe(TaskStatus.COMPLETED);
        expect(audit.listByEntity('objective', 'objective-042').map(({ action }) => action)).toContain('EXECUTION_REPORTED');
        expect(events.database.prepare('SELECT type FROM events ORDER BY rowid').all().map(({ type }) => type)).toEqual([
            'TASK_CREATED', 'TASK_ASSIGNED', 'OBJECTIVE_ACTIVATED', 'TASK_QUEUED', 'TASK_STARTED', 'TASK_PROGRESS',
            'TASK_REVIEW_REQUIRED', 'TASK_REVIEW_PASSED', 'OBJECTIVE_COMPLETED',
        ]);
    });

    it('routes bounded rework through the queue and requires another explicit review', async () => {
        const outcome = await orchestrator.run({ plan: approvedPlan, assignments, reviewDecisions: [
            { taskId: 'task-042', decision: 'REWORK', feedback: 'Add a regression assertion.' },
            { taskId: 'task-042', decision: 'APPROVED' },
        ] });
        expect(outcome.ok).toBe(true);
        expect(executions).toBe(2);
        expect(outcome.value.tasks[0]).toMatchObject({ status: TaskStatus.COMPLETED, retryCount: 1 });
        expect(queueRepository.getByTaskId('task-042').state).toBe('COMPLETED');
        expect(audit.listByTask('task-042').map(({ action }) => action)).toContain('TASK_REVIEW_REWORK');
    });

    it('refuses an unapproved plan before creating execution work', async () => {
        const outcome = await orchestrator.run({ plan: planDraft(), assignments });
        expect(outcome.error.code).toBe('plan-not-approved');
        expect(objectives.getById('objective-042').status).toBe(ObjectiveStatus.PLANNING);
        expect(tasks.list()).toEqual([]);
        expect(projects.list()).toEqual([]);
    });
});

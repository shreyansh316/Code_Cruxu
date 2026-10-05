/** Phase 036 — approved plan task creation and hierarchy assignment. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlanApprovalUseCase, createTaskCreationUseCase } from '../src/application';
import { AgentRole } from '../src/constants';
import { assertPlanApproved } from '../src/domain';
import { SqliteEventBus } from '../src/infrastructure';
import { AgentRepository, AuditLogRepository, ObjectiveRepository, OrganizationRepository,
    ProjectRepository, SqliteConnection, TaskDependencyRepository, TaskRepository, applyMigrations } from '../src/storage';
import { createSqliteUnitOfWork } from '../src/infrastructure';

const createPlan = () => ({
    id: 'plan-036', objectiveId: 'objective-036',
    projects: [{ id: 'project-036', name: 'Release project', description: 'Planned work' }],
    milestones: [{ id: 'milestone-036-1', projectId: 'project-036', title: 'Delivery' }],
    tasks: [
        { id: 'task-036-1', taskCode: 'PH036-001', title: 'Implement', projectId: 'project-036', milestoneId: 'milestone-036-1',
            acceptanceCriteria: [{ id: 'criterion-1', description: 'Implementation complete', required: true, met: false }] },
        { id: 'task-036-2', taskCode: 'PH036-002', title: 'Verify', projectId: 'project-036', milestoneId: 'milestone-036-1',
            acceptanceCriteria: [{ id: 'criterion-2', description: 'Verification passes', required: true, met: false }] },
    ],
    dependencies: [{ dependentTaskId: 'task-036-2', dependencyTaskId: 'task-036-1' }],
});

describe('Phase 036 — task creation use case', () => {
    let connection;
    let database;
    let objectives;
    let projects;
    let tasks;
    let taskDependencies;
    let agents;
    let audit;
    let events;
    let plan;
    let approvedPlan;
    let workflow;
    let nextGeneratedId;

    beforeEach(async () => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        const organizations = new OrganizationRepository(database);
        objectives = new ObjectiveRepository(database);
        projects = new ProjectRepository(database);
        tasks = new TaskRepository(database);
        taskDependencies = new TaskDependencyRepository(database);
        agents = new AgentRepository(database);
        audit = new AuditLogRepository(database);
        events = new SqliteEventBus(database);

        organizations.create({ id: 'organization-036', name: 'HEADROOM' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-036', 'organization-036', 'Office', 'office-036');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-036-a', 'office-036', 'Department A', 'department-036-a');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-036-b', 'office-036', 'Department B', 'department-036-b');
        agents.create({ id: 'agent-036-ceo', name: 'CEO', role: AgentRole.CEO });
        agents.create({ id: 'agent-036-manager-a', name: 'Manager A', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'department-036-a' });
        agents.create({ id: 'agent-036-manager-b', name: 'Manager B', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'department-036-b' });
        agents.create({ id: 'agent-036-employee-a', name: 'Employee A', role: AgentRole.EMPLOYEE, departmentId: 'department-036-a', capabilities: ['npm', 'vite'] });
        agents.create({ id: 'agent-036-employee-b', name: 'Employee B', role: AgentRole.EMPLOYEE, departmentId: 'department-036-b' });
        objectives.create({ id: 'objective-036', title: 'Deliver release', description: 'Release objective', organizationId: 'organization-036' });

        plan = createPlan();
        const approval = createPlanApprovalUseCase({ agentRepository: agents,
            clock: { now: () => '2026-10-03T12:00:00.000Z' } });
        approvedPlan = (await approval.run({ plan, approverId: 'agent-036-ceo', decision: 'APPROVED' })).value;
        let id = 0;
        nextGeneratedId = () => `generated-036-${++id}`;
        workflow = createTaskCreationUseCase({
            objectiveRepository: objectives, projectRepository: projects, taskRepository: tasks,
            dependencyRepository: taskDependencies,
            hierarchyProvider: { getSnapshot: () => ({
                organization: { id: 'organization-036', name: 'HEADROOM' },
                offices: [{ id: 'office-036', organizationId: 'organization-036', name: 'Office', slug: 'office-036', status: 'ACTIVE' }],
                departments: [
                    { id: 'department-036-a', officeId: 'office-036', name: 'Department A', slug: 'department-036-a', status: 'ACTIVE' },
                    { id: 'department-036-b', officeId: 'office-036', name: 'Department B', slug: 'department-036-b', status: 'ACTIVE' },
                ],
                agents: agents.list(),
            }) },
            auditRepository: audit, eventPublisher: events, unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => '2026-10-03T12:00:00.000Z' }, idFactory: nextGeneratedId,
        });
    });
    afterEach(() => connection.close());

    const assignments = (assigneeId = 'agent-036-employee-a') => plan.tasks.map(({ id }) => ({
        taskId: id, creatorId: 'agent-036-manager-a', assigneeId,
    }));

    it('persists approved plan projects, assigned tasks, criteria, dependencies, events, and audit records', async () => {
        const result = await workflow.run({ plan: approvedPlan, assignments: assignments() });
        expect(result.ok).toBe(true);
        expect(assertPlanApproved(approvedPlan)).toBe(approvedPlan);
        expect(result.value.projects[0]).toMatchObject({ id: 'project-036', objectiveId: 'objective-036' });
        expect(result.value.tasks).toHaveLength(2);
        expect(tasks.listByProject('project-036').map((task) => task.status)).toEqual(['CREATED', 'CREATED']);
        expect(tasks.getById('task-036-1').acceptanceCriteria).toEqual(plan.tasks[0].acceptanceCriteria);
        expect(taskDependencies.listByTask('task-036-2')).toEqual([{
            id: expect.any(String), dependentTaskId: 'task-036-2', dependencyTaskId: 'task-036-1',
        }]);
        expect(audit.listByTask('task-036-1')).toHaveLength(1);
        expect(events.database.prepare('SELECT type FROM events ORDER BY rowid').all()).toEqual([
            { type: 'TASK_CREATED' }, { type: 'TASK_ASSIGNED' }, { type: 'TASK_CREATED' }, { type: 'TASK_ASSIGNED' },
        ]);
    });

    it('routes only to employees with every required capability and persists the requirement', async () => {
        const capabilityPlan = { ...approvedPlan, tasks: approvedPlan.tasks.map((task, index) => index === 0
            ? { ...task, requiredCapabilities: ['npm', 'Vite'] } : task) };
        const outcome = await workflow.run({ plan: capabilityPlan, assignments: assignments() });
        expect(outcome.ok).toBe(true);
        expect(tasks.getById('task-036-1').requiredCapabilities).toEqual(['npm', 'Vite']);

        const unsupportedPlan = { ...approvedPlan, tasks: approvedPlan.tasks.map((task, index) => index === 0
            ? { ...task, requiredCapabilities: ['terraform'] } : task) };
        const rejected = await workflow.run({ plan: unsupportedPlan, assignments: assignments() });
        expect(rejected.error.code).toBe('invalid-assignment');
        expect(tasks.list()).toHaveLength(2);
    });

    it('rejects unapproved plans, incomplete assignment maps, and cross-department assignments', async () => {
        const unapproved = await workflow.run({ plan, assignments: assignments() });
        expect(unapproved.error.code).toBe('plan-not-approved');
        const incomplete = await workflow.run({ plan: approvedPlan, assignments: assignments().slice(1) });
        expect(incomplete.error.code).toBe('invalid-task-assignment');
        const crossDepartment = await workflow.run({ plan: approvedPlan, assignments: assignments('agent-036-employee-b') });
        expect(crossDepartment.error.code).toBe('invalid-assignment');
        expect(tasks.list()).toEqual([]);
        expect(projects.list()).toEqual([]);
    });

    it('rolls back project, tasks, dependency, audit, and event writes on any failure', async () => {
        const failing = createTaskCreationUseCase({
            objectiveRepository: objectives, projectRepository: projects, taskRepository: tasks,
            dependencyRepository: taskDependencies,
            hierarchyProvider: { getSnapshot: workflowHierarchy() },
            auditRepository: audit, eventPublisher: events, unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => '2026-10-03T12:00:00.000Z' }, idFactory: () => 'duplicate-generated-id',
        });
        const result = await failing.run({ plan: approvedPlan, assignments: assignments() });
        expect(result.ok).toBe(false);
        expect(tasks.list()).toEqual([]);
        expect(projects.list()).toEqual([]);
        expect(database.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count).toBe(0);
        expect(database.prepare('SELECT COUNT(*) AS count FROM events').get().count).toBe(0);
    });

    it('rejects an unowned objective or hierarchy from another organization before writing', async () => {
        const unowned = createTaskCreationUseCase({
            objectiveRepository: { getById: (id) => ({ ...objectives.getById(id), organizationId: null }) },
            projectRepository: projects, taskRepository: tasks, dependencyRepository: taskDependencies,
            hierarchyProvider: { getSnapshot: workflowHierarchy() }, auditRepository: audit,
            eventPublisher: events, unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => '2026-10-03T12:00:00.000Z' }, idFactory: nextGeneratedId,
        });
        expect((await unowned.run({ plan: approvedPlan, assignments: assignments() })).error.code)
            .toBe('objective-organization-missing');

        const foreignHierarchy = createTaskCreationUseCase({
            objectiveRepository: objectives, projectRepository: projects, taskRepository: tasks,
            dependencyRepository: taskDependencies,
            hierarchyProvider: { getSnapshot: () => ({ ...workflowHierarchy()(), organization: { id: 'other-org' } }) },
            auditRepository: audit, eventPublisher: events, unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => '2026-10-03T12:00:00.000Z' }, idFactory: nextGeneratedId,
        });
        expect((await foreignHierarchy.run({ plan: approvedPlan, assignments: assignments() })).error.code)
            .toBe('task-organization-scope-mismatch');

        const foreignAgent = createTaskCreationUseCase({
            objectiveRepository: objectives, projectRepository: projects, taskRepository: tasks,
            dependencyRepository: taskDependencies,
            hierarchyProvider: { getSnapshot: () => {
                const hierarchy = workflowHierarchy()();
                return { ...hierarchy, agents: hierarchy.agents.map((agent) => agent.id === 'agent-036-employee-a'
                    ? { ...agent, organizationId: 'other-organization' } : agent) };
            } },
            auditRepository: audit, eventPublisher: events, unitOfWork: createSqliteUnitOfWork(database),
            clock: { now: () => '2026-10-03T12:00:00.000Z' }, idFactory: nextGeneratedId,
        });
        expect((await foreignAgent.run({ plan: approvedPlan, assignments: assignments() })).error.code)
            .toBe('invalid-hierarchy');
        expect(tasks.list()).toEqual([]);
        expect(projects.list()).toEqual([]);
    });

    function workflowHierarchy() {
        return () => ({
            organization: { id: 'organization-036', name: 'HEADROOM' },
            offices: [{ id: 'office-036', organizationId: 'organization-036', name: 'Office', slug: 'office-036', status: 'ACTIVE' }],
            departments: [
                { id: 'department-036-a', officeId: 'office-036', name: 'Department A', slug: 'department-036-a', status: 'ACTIVE' },
                { id: 'department-036-b', officeId: 'office-036', name: 'Department B', slug: 'department-036-b', status: 'ACTIVE' },
            ], agents: agents.list(),
        });
    }
});

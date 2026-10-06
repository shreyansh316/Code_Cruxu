/** Phase 351 — retrieve organizational memories only along the active task's authorized path. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createOrganizationalTaskMemoryProvider } from '../src/application';
import { AgentRole, TaskStatus } from '../src/constants';
import { AgentRepository, DepartmentRepository, MemoryRepository, ObjectiveRepository, OfficeRepository,
    OrganizationRepository, ProjectRepository, TaskRepository, SqliteConnection, applyMigrations } from '../src/storage';

const NOW = '2026-10-06T00:00:00.000Z';

describe('Phase 351 — hierarchy-scoped organizational task memory', () => {
    let connection; let database; let agents; let tasks; let memories; let projects; let objectives;
    let employee; let task; let hierarchyProvider;
    beforeEach(() => {
        connection = new SqliteConnection(); database = connection.open(':memory:'); applyMigrations(database);
        const organizations = new OrganizationRepository(database);
        organizations.create({ id: 'organization-351', name: 'Org' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-351', 'organization-351', 'Office', 'office-351');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-351', 'office-351', 'Department', 'department-351');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-351-other', 'office-351', 'Other Department', 'department-351-other');
        agents = new AgentRepository(database);
        const manager = agents.create({ id: 'manager-351', name: 'Manager', role: AgentRole.DEPT_MANAGER,
            managedDepartmentId: 'department-351' });
        employee = agents.create({ id: 'employee-351', name: 'Employee', role: AgentRole.EMPLOYEE,
            departmentId: 'department-351' });
        agents.create({ id: 'employee-351-other', name: 'Other employee', role: AgentRole.EMPLOYEE,
            departmentId: 'department-351-other' });
        objectives = new ObjectiveRepository(database);
        objectives.create({ id: 'objective-351', organizationId: 'organization-351', title: 'Cache', description: 'Project memory', status: 'ACTIVE' });
        objectives.create({ id: 'objective-351-other', organizationId: 'organization-351', title: 'Other', description: 'Other', status: 'ACTIVE' });
        projects = new ProjectRepository(database);
        projects.create({ id: 'project-351', name: 'Cache project', objectiveId: 'objective-351' });
        projects.create({ id: 'project-351-other', name: 'Other project', objectiveId: 'objective-351-other' });
        tasks = new TaskRepository(database);
        task = tasks.create({ id: 'task-351', taskCode: 'PH351-001', title: 'Build cache', description: 'Persist cache safely.',
            projectId: 'project-351', creatorId: manager.id, assigneeId: employee.id, status: TaskStatus.IN_PROGRESS });
        hierarchyProvider = { getSnapshot: () => ({ organization: organizations.getById('organization-351'),
            offices: new OfficeRepository(database).listByOrganization('organization-351'),
            departments: new DepartmentRepository(database).list(), agents: agents.listByOrganization('organization-351') }) };
        memories = new MemoryRepository(database);
        memories.create({ id: 'memory-351-employee', scope: 'EMPLOYEE', agentId: employee.id,
            title: 'Implementation preference', content: 'Prefer small focused cache tests.' });
        memories.create({ id: 'memory-351-task', scope: 'TASK', taskId: task.id,
            title: 'Task constraint', content: 'Preserve cache entries across restart.' });
        memories.create({ id: 'memory-351-project', scope: 'PROJECT', projectId: 'project-351',
            title: 'Cache interface', content: 'Keep cache APIs deterministic.' });
        memories.create({ id: 'memory-351-department', scope: 'DEPARTMENT', departmentId: 'department-351',
            title: 'Department standard', content: 'Cache changes require regression tests.' });
        memories.create({ id: 'memory-351-office', scope: 'OFFICE', officeId: 'office-351',
            title: 'Office policy', content: 'Document data retention behavior.' });
        memories.create({ id: 'memory-351-other', scope: 'DEPARTMENT', departmentId: 'department-351-other',
            title: 'Other department', content: 'Must remain isolated.' });
        memories.create({ id: 'memory-351-other-project', scope: 'PROJECT', projectId: 'project-351-other',
            title: 'Other project', content: 'Must not be visible to this project.' });
    });
    afterEach(() => connection.close());

    function provider() {
        return createOrganizationalTaskMemoryProvider({ memoryRepository: memories, agentRepository: agents,
            taskRepository: tasks, projectRepository: projects, objectiveRepository: objectives, hierarchyProvider,
            now: () => NOW });
    }

    it('returns task-relevant employee, task, project, department and office records', () => {
        const context = provider().forTask({ actor: employee, task });
        expect(Object.keys(context)).toEqual(['employee', 'task', 'project', 'department', 'office']);
        expect(Object.values(context).flat().map(({ id }) => id)).toEqual([
            'memory-351-employee', 'memory-351-task', 'memory-351-project', 'memory-351-department', 'memory-351-office',
        ]);
    });

    it('never retrieves another organization, another employee, or another project path', () => {
        const context = JSON.stringify(provider().forTask({ actor: employee, task }));
        expect(context).not.toContain('Must remain isolated');
        expect(context).not.toContain('Other employee');
        expect(context).not.toContain('Other project');
    });

    it('rejects stale assignees and tasks outside active execution', () => {
        expect(() => provider().forTask({ actor: agents.getById('employee-351-other'), task }))
            .toThrow(/current persisted task assignee/);
        expect(() => provider().forTask({ actor: employee, task: { ...task, status: TaskStatus.ASSIGNED } }))
            .toThrow(/current persisted task assignee/);
    });
});

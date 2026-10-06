/** Phase 311 — deleting owners cascades their scoped organizational memories. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentRepository, DepartmentRepository, MemoryRepository, ObjectiveRepository, OfficeRepository,
    OrganizationRepository, ProjectRepository, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 311 — scoped memory deletion behavior', () => {
    let connection; let organizations; let memories;
    beforeEach(() => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        organizations = new OrganizationRepository(database);
        organizations.create({ id: 'org-311', name: 'Organization' });
        const office = new OfficeRepository(database).create({ id: 'office-311', organizationId: 'org-311', name: 'Office', slug: 'office' });
        const department = new DepartmentRepository(database).create({ id: 'department-311', officeId: office.id, name: 'Department', slug: 'department' });
        const objective = new ObjectiveRepository(database).create({ id: 'objective-311', organizationId: 'org-311', title: 'Objective', description: 'Delete with owner' });
        const project = new ProjectRepository(database).create({ id: 'project-311', objectiveId: objective.id, name: 'Project' });
        const task = new TaskRepository(database).create({ id: 'task-311', projectId: project.id, taskCode: 'PH311-001', title: 'Task' });
        new AgentRepository(database).create({ id: 'ceo-311', organizationId: 'org-311', name: 'CEO', role: 'CEO' });
        memories = new MemoryRepository(database);
        const entries = [
            { id: 'memory-ceo-311', scope: 'CEO', organizationId: 'org-311' },
            { id: 'memory-director-311', scope: 'DIRECTOR', organizationId: 'org-311' },
            { id: 'memory-office-311', scope: 'OFFICE', officeId: office.id },
            { id: 'memory-department-311', scope: 'DEPARTMENT', departmentId: department.id },
            { id: 'memory-task-311', scope: 'TASK', taskId: task.id },
            { id: 'memory-project-311', scope: 'PROJECT', projectId: project.id },
            { id: 'memory-decision-311', scope: 'DECISION', objectiveId: objective.id },
            { id: 'memory-knowledge-311', scope: 'KNOWLEDGE', projectId: project.id },
        ];
        for (const entry of entries) memories.create({ ...entry, title: entry.id, content: 'private data', importance: 1 });

        organizations.create({ id: 'org-311-other', name: 'Other Organization' });
        const otherObjective = new ObjectiveRepository(database).create({ id: 'objective-311-other', organizationId: 'org-311-other',
            title: 'Other objective', description: 'Must remain' });
        const otherProject = new ProjectRepository(database).create({ id: 'project-311-other', objectiveId: otherObjective.id, name: 'Other project' });
        new TaskRepository(database).create({ id: 'task-311-other', projectId: otherProject.id, taskCode: 'PH311-OTHER', title: 'Other task' });
        memories.create({ id: 'memory-knowledge-other', scope: 'KNOWLEDGE', projectId: otherProject.id,
            title: 'Other memory', content: 'Must remain', importance: 1 });
    });
    afterEach(() => connection.close());

    it('removes every memory owned by the organization hierarchy when the organization is deleted', () => {
        expect(memories.list()).toHaveLength(9);
        expect(organizations.delete('org-311')).toBe(true);
        expect(memories.list().map(({ id }) => id)).toEqual(['memory-knowledge-other']);
        expect(new ProjectRepository(connection.database).list().map(({ id }) => id)).toEqual(['project-311-other']);
        expect(new TaskRepository(connection.database).list().map(({ id }) => id)).toEqual(['task-311-other']);
    });
});

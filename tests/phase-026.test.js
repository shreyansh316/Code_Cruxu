/** Phase 026 — scope-validated SQLite memory persistence. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteConnection, applyMigrations, MemoryRepository, ObjectiveRepository, OrganizationRepository,
    ProjectRepository, TaskRepository } from '../src/storage';
import { createEntityId } from '../src/domain';

describe('Phase 026 — scoped memory repository', () => {
    let connection;
    let database;
    let memories;
    let owners;
    beforeEach(() => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        memories = new MemoryRepository(database);
        const organizations = new OrganizationRepository(database);
        const objectives = new ObjectiveRepository(database);
        const projects = new ProjectRepository(database);
        const tasks = new TaskRepository(database);
        const organization = organizations.create({ id: 'org-memory', name: 'Memory Org' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-memory', organization.id, 'Office', 'memory-office');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-memory', 'office-memory', 'Department', 'memory-department');
        const objective = objectives.create({ id: 'objective-memory', title: 'Objective', description: 'Test owner' });
        const project = projects.create({ id: 'project-memory', name: 'Project', objectiveId: objective.id });
        const task = tasks.create({ id: 'task-memory', taskCode: 'MEM-001', title: 'Task', projectId: project.id });
        owners = { organization, officeId: 'office-memory', departmentId: 'department-memory',
            objectiveId: objective.id, projectId: project.id, taskId: task.id };
    });
    afterEach(() => connection.close());

    const memory = (id, scope, owner) => ({
        id: createEntityId(id), scope, title: id, content: `Content for ${id}`, importance: 1,
        ...owner,
    });

    it('persists records for each supported scope with exactly one matching owner', () => {
        const records = [
            memory('mem-ceo', 'CEO', { organizationId: owners.organization.id }),
            memory('mem-director', 'DIRECTOR', { organizationId: owners.organization.id }),
            memory('mem-office', 'OFFICE', { officeId: owners.officeId }),
            memory('mem-department', 'DEPARTMENT', { departmentId: owners.departmentId }),
            memory('mem-task', 'TASK', { taskId: owners.taskId }),
            memory('mem-project', 'PROJECT', { projectId: owners.projectId }),
            memory('mem-decision', 'DECISION', { objectiveId: owners.objectiveId }),
            memory('mem-knowledge', 'KNOWLEDGE', { projectId: owners.projectId }),
        ];
        for (const item of records) expect(memories.create(item)).toMatchObject({ id: item.id, scope: item.scope });
        expect(memories.list()).toHaveLength(8);
    });

    it('isolates scope and owner queries and updates only valid records', () => {
        const first = memories.create(memory('mem-task-one', 'TASK', { taskId: owners.taskId }));
        memories.create(memory('mem-project-one', 'PROJECT', { projectId: owners.projectId }));
        expect(memories.listByScope('TASK')).toEqual([first]);
        expect(memories.listByOwner('TASK', owners.taskId)).toEqual([first]);
        expect(memories.update(first.id, { verified: 1 })?.verified).toBe(1);
        expect(memories.delete(first.id)).toBe(true);
        expect(memories.listByOwner('TASK', owners.taskId)).toEqual([]);
    });

    it('rejects missing, mismatched, multiple, unsupported, and invalid owner links', () => {
        for (const candidate of [
            memory('mem-no-owner', 'TASK', {}),
            memory('mem-wrong-owner', 'TASK', { projectId: owners.projectId }),
            memory('mem-multi-owner', 'TASK', { taskId: owners.taskId, projectId: owners.projectId }),
            memory('mem-bad-scope', 'UNKNOWN', { taskId: owners.taskId }),
            memory('mem-orphan', 'TASK', { taskId: 'missing-task' }),
        ]) {
            expect(() => memories.create(candidate)).toThrow();
        }
        expect(() => memories.listByOwner('UNKNOWN', 'x')).toThrow();
    });

    it('enforces ownership triggers even for direct SQL writes and updates', () => {
        expect(() => database.prepare(`INSERT INTO memories (id, scope, title, content, project_id)
          VALUES (?, 'TASK', 'Bad', 'Bad owner', ?)`)
            .run('raw-invalid', owners.projectId)).toThrow(/memory scope owner mismatch/);
        memories.create(memory('mem-trigger-update', 'TASK', { taskId: owners.taskId }));
        expect(() => database.prepare('UPDATE memories SET scope = ? WHERE id = ?').run('PROJECT', 'mem-trigger-update'))
            .toThrow(/memory scope owner mismatch/);
    });
});

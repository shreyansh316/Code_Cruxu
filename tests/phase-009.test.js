/** Phase 009 — typed, parameterized core SQLite repositories. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { SqliteConnection } from '../src/storage/SqliteConnection';
import { AgentRepository, DirectorQuestionRepository, ObjectiveRepository, OrganizationRepository, ProjectRepository, TaskRepository, applyMigrations, } from '../src/storage';
import { AgentRole, ObjectiveStatus, TaskStatus } from '../src/constants';
import { createEntityId } from '../src/domain';
describe('Phase 009 — core SQLite repositories', () => {
    let connection;
    let organizations;
    let objectives;
    let projects;
    let agents;
    let tasks;
    let questions;
    beforeEach(() => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        organizations = new OrganizationRepository(database);
        objectives = new ObjectiveRepository(database);
        projects = new ProjectRepository(database);
        agents = new AgentRepository(database);
        tasks = new TaskRepository(database);
        questions = new DirectorQuestionRepository(database);
    });
    afterEach(() => connection.close());
    it('provides organization create, lookup, list, update, and delete operations', () => {
        const id = createEntityId('org-1');
        const created = organizations.create({ id, name: 'HEADROOM' });
        expect(created).toMatchObject({ id, name: 'HEADROOM' });
        expect(created.createdAt).toEqual(expect.any(String));
        expect(created.updatedAt).toEqual(expect.any(String));
        expect(() => organizations.create({ id, name: 'Duplicate' })).toThrow();
        expect(organizations.getById(id)).toEqual(created);
        expect(organizations.list()).toEqual([created]);
        expect(organizations.update(id, { name: 'Headroom Office' })?.name).toBe('Headroom Office');
        expect(organizations.delete(id)).toBe(true);
        expect(organizations.delete(id)).toBe(false);
        expect(organizations.getById(id)).toBeUndefined();
    });
    it('enforces non-empty identifier strings at the JavaScript repository boundary', () => {
        expect(organizations.create({ id: ' org-normalized ', name: 'Normalized' }).id)
            .toBe('org-normalized');
        expect(() => organizations.create({ id: '  ', name: 'Invalid' }))
            .toThrowError(/identifier must be a non-empty string/i);
        expect(() => organizations.getById('  '))
            .toThrowError(/identifier must be a non-empty string/i);
    });
    it('maps objective records, supports status queries, and preserves status constraints', () => {
        const objectiveId = createEntityId('objective-1');
        const objective = objectives.create({
            id: objectiveId, title: 'Build feature', description: 'Deliver a feature.',
            status: ObjectiveStatus.ACTIVE, priority: 3,
        });
        expect(objective).toMatchObject({ status: ObjectiveStatus.ACTIVE, priority: 3 });
        expect(objectives.listByStatus(ObjectiveStatus.ACTIVE)).toEqual([objective]);
        expect(objectives.update(objectiveId, { status: ObjectiveStatus.PAUSED })?.status)
            .toBe(ObjectiveStatus.PAUSED);
        expect(() => objectives.create({
            id: createEntityId('objective-invalid'), title: 'Bad', description: 'Bad status',
            status: 'INVALID',
        })).toThrow();
        expect(objectives.delete(objectiveId)).toBe(true);
    });
    it('maps projects, supports objective/status queries, and enforces the objective foreign key', () => {
        const objective = objectives.create({
            id: createEntityId('objective-project'), title: 'Parent objective', description: 'Project parent.',
        });
        const projectId = createEntityId('project-1');
        const project = projects.create({ id: projectId, name: 'Project One', objectiveId: objective.id });
        expect(project).toMatchObject({ status: 'PLANNING', priority: 0, objectiveId: objective.id });
        expect(projects.listByObjective(objective.id)).toEqual([project]);
        expect(projects.listByStatus('PLANNING')).toEqual([project]);
        expect(projects.update(projectId, { status: 'ACTIVE', priority: 4 })?.status).toBe('ACTIVE');
        expect(() => projects.create({
            id: createEntityId('project-invalid'), name: 'Orphan', objectiveId: createEntityId('missing'),
        })).toThrow();
        expect(objectives.delete(objective.id)).toBe(true);
        expect(projects.getById(projectId)?.objectiveId).toBeNull();
        expect(projects.delete(projectId)).toBe(true);
    });
    it('maps agents and supports role and department queries with parameterized ids', () => {
        const organization = organizations.create({ id: createEntityId('org-agents'), name: 'Agents Org' });
        const officeId = createEntityId('office-agents');
        const departmentId = createEntityId('department-agents');
        const database = connection.database;
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run(officeId, organization.id, 'Office', 'agent-office');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run(departmentId, officeId, 'Department', 'agent-department');
        const agentId = createEntityId("agent-' OR 1=1 --");
        const agent = agents.create({
            id: agentId, name: 'Team member', role: AgentRole.EMPLOYEE, departmentId,
        });
        expect(agent).toMatchObject({ status: 'IDLE', role: AgentRole.EMPLOYEE, departmentId });
        expect(agents.getById(agentId)).toEqual(agent);
        expect(agents.listByRole(AgentRole.EMPLOYEE)).toEqual([agent]);
        expect(agents.listByDepartment(departmentId)).toEqual([agent]);
        expect(() => agents.create({
            id: createEntityId('agent-invalid-role'), name: 'Unknown', role: 'INTERN',
        })).toThrow();
        expect(agents.getById(createEntityId("missing' OR 1=1 --"))).toBeUndefined();
        expect(agents.update(agentId, { status: 'BUSY' })?.status).toBe('BUSY');
        expect(agents.delete(agentId)).toBe(true);
    });
    it('maps complete task records, supports filtered queries, and preserves database checks', () => {
        const objective = objectives.create({
            id: createEntityId('objective-task'), title: 'Task objective', description: 'Task parent.',
        });
        const project = projects.create({
            id: createEntityId('project-task'), name: 'Task project', objectiveId: objective.id,
        });
        const creator = agents.create({ id: createEntityId('agent-task'), name: 'Creator', role: AgentRole.CEO });
        const taskId = createEntityId('task-1');
        const task = tasks.create({
            id: taskId, taskCode: 'TASK-001', title: 'Implement repository',
            projectId: project.id, creatorId: creator.id, tokenBudget: 500, timeBudgetMs: 1000,
        });
        expect(task).toMatchObject({
            status: TaskStatus.CREATED, priority: 0, retryCount: 0, maxRetries: 2,
            projectId: project.id, creatorId: creator.id, tokenBudget: 500, timeBudgetMs: 1000,
        });
        expect(tasks.listByStatus(TaskStatus.CREATED)).toEqual([task]);
        expect(tasks.listByProject(project.id)).toEqual([task]);
        expect(tasks.update(taskId, { status: TaskStatus.IN_PROGRESS, retryCount: 1 })?.retryCount).toBe(1);
        expect(() => tasks.create({
            id: createEntityId('task-duplicate-code'), taskCode: 'TASK-001', title: 'Duplicate code',
        })).toThrow();
        expect(() => tasks.create({
            id: createEntityId('task-bad-budget'), taskCode: 'TASK-002', title: 'Invalid retry',
            retryCount: 3, maxRetries: 2,
        })).toThrow();
        expect(() => tasks.update(taskId, { retryCount: 3, maxRetries: 2 })).toThrow();
        expect(tasks.delete(taskId)).toBe(true);
    });
    it('maps director questions in stable objective order and enforces required references', () => {
        const objective = objectives.create({
            id: createEntityId('objective-questions'), title: 'Question objective', description: 'Questions.',
        });
        const later = questions.create({
            id: createEntityId('question-later'), objectiveId: objective.id,
            question: 'Second?', sortOrder: 2,
        });
        const earlier = questions.create({
            id: createEntityId('question-earlier'), objectiveId: objective.id,
            question: 'First?', sortOrder: 1,
        });
        expect(later.status).toBe('PENDING');
        expect(questions.listByObjective(objective.id)).toEqual([earlier, later]);
        expect(questions.listByStatus('PENDING')).toHaveLength(2);
        expect(questions.update(earlier.id, { answer: 'Because it is required.', status: 'ANSWERED' }))
            .toMatchObject({ answer: 'Because it is required.', status: 'ANSWERED' });
        expect(() => questions.create({
            id: createEntityId('question-orphan'), objectiveId: createEntityId('missing-objective'), question: 'Orphan?',
        })).toThrow();
        expect(questions.delete(later.id)).toBe(true);
    });
    it('keeps storage repositories independent from the domain module', () => {
        const repositoryDirectory = join(__dirname, '..', 'src', 'storage', 'repositories');
        for (const entry of readdirSync(repositoryDirectory, { withFileTypes: true })) {
            if (!entry.isFile() || !entry.name.endsWith('.js'))
                continue;
            const source = readFileSync(join(repositoryDirectory, entry.name), 'utf8');
            expect(source, entry.name).not.toMatch(/from\s+['"][^'"]*\/domain(?:\/[^'"]*)?['"]/);
        }
    });
});

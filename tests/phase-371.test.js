/** Phase 371 — immutable, authorized lineage between engineering decisions. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLinkEngineeringDecisionsUseCase } from '../src/application';
import { AgentRepository, AuditLogRepository, EngineeringDecisionRepository, ObjectiveRepository,
    OrganizationRepository, ProjectRepository, SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';
import { createSqliteUnitOfWork } from '../src/infrastructure';

describe('Phase 371 — engineering decision lineage', () => {
    let connection;
    afterEach(() => { connection?.close(); connection = undefined; vi.restoreAllMocks(); });

    it('authorizes lineage, audits it, blocks cycles and keeps links immutable', async () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-371', name: 'Org' });
        new ObjectiveRepository(database).create({ id: 'objective-371', organizationId: 'org-371', title: 'Build product', description: 'Build' });
        new ProjectRepository(database).create({ id: 'project-371', objectiveId: 'objective-371', name: 'Core', description: 'Core project' });
        database.prepare('INSERT INTO offices (id, organization_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('office-371', 'org-371', 'Office', 'office-371');
        database.prepare('INSERT INTO departments (id, office_id, name, slug) VALUES (?, ?, ?, ?)')
            .run('department-371', 'office-371', 'Department', 'department-371');
        new AgentRepository(database).create({ id: 'author-371', name: 'Author', role: 'EMPLOYEE', departmentId: 'department-371' });
        const tasks = new TaskRepository(database);
        tasks.create({ id: 'task-371-a', taskCode: 'PH371-A', title: 'Choose format', projectId: 'project-371', assigneeId: 'author-371' });
        tasks.create({ id: 'task-371-b', taskCode: 'PH371-B', title: 'Revisit format', projectId: 'project-371', assigneeId: 'author-371' });
        const decisions = new EngineeringDecisionRepository(database);
        const decision = (id, taskId) => decisions.create({ id, taskId, authorId: 'author-371', context: 'Need durable state',
            options: ['SQLite', 'Files'], selectedOption: 'SQLite', rejectedOptions: ['Files'], reason: 'Atomic transactions',
            tradeOffs: ['Migrations'], evidence: ['Crash recovery test'], confidence: 0.9 });
        decision('decision-371-a', 'task-371-a'); decision('decision-371-b', 'task-371-b');
        const audits = new AuditLogRepository(database);
        let next = 0;
        const useCase = createLinkEngineeringDecisionsUseCase({ decisionRepository: decisions, taskRepository: tasks,
            agentRepository: new AgentRepository(database), auditRepository: audits,
            unitOfWork: createSqliteUnitOfWork(database), idFactory: () => `link-371-${++next}` });
        const saved = await useCase.run({ sourceDecisionId: 'decision-371-b', targetDecisionId: 'decision-371-a',
            relationship: 'SUPERSEDES', authorId: 'author-371' });
        expect(saved.ok).toBe(true);
        expect(decisions.listLinks('decision-371-a')).toMatchObject([{ sourceDecisionId: 'decision-371-b',
            targetDecisionId: 'decision-371-a', relationship: 'SUPERSEDES', authorId: 'author-371' }]);
        expect(audits.listByTask('task-371-b')).toEqual(expect.arrayContaining([
            expect.objectContaining({ action: 'ENGINEERING_DECISIONS_LINKED', entityId: saved.value.id }),
        ]));
        const cycle = await useCase.run({ sourceDecisionId: 'decision-371-a', targetDecisionId: 'decision-371-b',
            relationship: 'SUPERSEDES', authorId: 'author-371' });
        expect(cycle.ok).toBe(false);
        expect(decisions.listLinks('decision-371-a')).toHaveLength(1);
        expect(() => database.prepare('UPDATE engineering_decision_links SET relationship = ? WHERE id = ?')
            .run('RELATED_TO', saved.value.id)).toThrow(/immutable/);
    });

    it('rejects non-participants and database trigger blocks cross-organization links', async () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:'); applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-371-x', name: 'Org X' });
        new OrganizationRepository(database).create({ id: 'org-371-y', name: 'Org Y' });
        new ObjectiveRepository(database).create({ id: 'objective-371-x', organizationId: 'org-371-x', title: 'X', description: 'X' });
        new ObjectiveRepository(database).create({ id: 'objective-371-y', organizationId: 'org-371-y', title: 'Y', description: 'Y' });
        new ProjectRepository(database).create({ id: 'project-371-x', objectiveId: 'objective-371-x', name: 'X', description: 'X project' });
        new ProjectRepository(database).create({ id: 'project-371-y', objectiveId: 'objective-371-y', name: 'Y', description: 'Y project' });
        const tasks = new TaskRepository(database);
        tasks.create({ id: 'task-371-x', taskCode: 'PH371-X', title: 'X', projectId: 'project-371-x' });
        tasks.create({ id: 'task-371-y', taskCode: 'PH371-Y', title: 'Y', projectId: 'project-371-y' });
        const agents = new AgentRepository(database);
        agents.create({ id: 'author-371-x', name: 'X author', role: 'CEO', organizationId: 'org-371-x' });
        const decisions = new EngineeringDecisionRepository(database);
        const make = (id, taskId) => decisions.create({ id, taskId, authorId: 'author-371-x', context: 'Context',
            options: ['A', 'B'], selectedOption: 'A', rejectedOptions: ['B'], reason: 'Reason', tradeOffs: [], evidence: [], confidence: 0.5 });
        make('decision-371-x', 'task-371-x'); make('decision-371-y', 'task-371-y');
        const useCase = createLinkEngineeringDecisionsUseCase({ decisionRepository: decisions, taskRepository: tasks,
            agentRepository: agents, auditRepository: new AuditLogRepository(database),
            unitOfWork: createSqliteUnitOfWork(database), idFactory: () => 'link-371-x' });
        expect((await useCase.run({ sourceDecisionId: 'decision-371-x', targetDecisionId: 'decision-371-y',
            relationship: 'RELATED_TO', authorId: 'author-371-x' })).error.code).toBe('decision-link-forbidden');
        expect(() => decisions.createLink({ id: 'link-371-cross', sourceDecisionId: 'decision-371-x',
            targetDecisionId: 'decision-371-y', relationship: 'RELATED_TO', authorId: 'author-371-x' }))
            .toThrow(/one organization/);
    });
});

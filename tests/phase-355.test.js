/** Phase 355 — secure organization-scoped engineering decision recall. */
import { afterEach, describe, expect, it } from 'vitest';
import { createDecisionRecallUseCase } from '../src/application';
import { EngineeringDecisionRepository, ObjectiveRepository, OrganizationRepository, ProjectRepository,
    SqliteConnection, TaskRepository, applyMigrations } from '../src/storage';

describe('Phase 355 — decision recall', () => {
    let connection;
    afterEach(() => connection?.close());

    it('recalls matching decisions only from the authorized organization', async () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const organizations = new OrganizationRepository(database);
        const objectives = new ObjectiveRepository(database);
        const projects = new ProjectRepository(database);
        const tasks = new TaskRepository(database);
        const decisions = new EngineeringDecisionRepository(database);
        for (const suffix of ['a', 'b']) {
            organizations.create({ id: `org-355-${suffix}`, name: `Org ${suffix}` });
            objectives.create({ id: `objective-355-${suffix}`, organizationId: `org-355-${suffix}`, title: 'Objective', description: 'Work' });
            projects.create({ id: `project-355-${suffix}`, objectiveId: `objective-355-${suffix}`, name: 'Project' });
            tasks.create({ id: `task-355-${suffix}`, taskCode: `PH355-${suffix.toUpperCase()}`, projectId: `project-355-${suffix}`, title: `Choose cache ${suffix}` });
            decisions.create({ id: `decision-355-${suffix}`, taskId: `task-355-${suffix}`, authorId: `author-${suffix}`,
                context: 'Need a durable cache for restarts.', options: ['SQLite', 'Memory'], selectedOption: 'SQLite',
                rejectedOptions: ['Memory'], reason: 'Survives restart reliably.', tradeOffs: ['Migration maintenance.'],
                evidence: ['Restart test.'], confidence: 0.8 });
        }
        const recall = createDecisionRecallUseCase({ decisionRepository: decisions,
            authorize: ({ actorId, organizationId }) => actorId === 'reviewer-a' && organizationId === 'org-355-a' });
        const result = await recall.run({ actorId: 'reviewer-a', organizationId: 'org-355-a', query: 'durable cache' });
        expect(result.ok).toBe(true);
        expect(result.value).toMatchObject([{ id: 'decision-355-a', taskId: 'task-355-a', taskTitle: 'Choose cache a' }]);
        expect(JSON.stringify(result.value)).not.toContain('decision-355-b');
        expect((await recall.run({ actorId: 'reviewer-b', organizationId: 'org-355-a', query: 'durable cache' })).error.code)
            .toBe('decision-recall-forbidden');
    });

    it('bounds recall queries and treats wildcard characters literally', () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:'); applyMigrations(database);
        const decisions = new EngineeringDecisionRepository(database);
        expect(() => decisions.searchByOrganization('org-355', '%_', { limit: 100 })).toThrow(/query or result bound/);
        expect(() => decisions.searchByOrganization('org-355', 'x'.repeat(201))).toThrow(/query or result bound/);
    });
});

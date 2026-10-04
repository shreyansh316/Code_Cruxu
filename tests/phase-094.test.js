/** Phase 094 — supported multi-office configuration and isolation. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDirectorOfficeOrchestration, createHierarchyMessageRouter, createOfficeConfigurationUseCase,
    createOfficeHeadRouting } from '../src/application';
import { OFFICE_CATALOG, AgentRole } from '../src/constants';
import { PlanDecision } from '../src/domain';
import { createSqliteUnitOfWork } from '../src/infrastructure';
import { AgentRepository, DepartmentRepository, OfficeRepository, OrganizationRepository,
    SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 094 — multi-office organization support', () => {
    let connection;
    let database;
    let organizations;
    let offices;
    let departments;
    let agents;
    let configureOffices;
    let nextId;

    beforeEach(() => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        organizations = new OrganizationRepository(database);
        offices = new OfficeRepository(database);
        departments = new DepartmentRepository(database);
        agents = new AgentRepository(database);
        organizations.create({ id: 'org-094-a', name: 'Organization A' });
        organizations.create({ id: 'org-094-b', name: 'Organization B' });
        let sequence = 0;
        nextId = () => `office-config-094-${++sequence}`;
        configureOffices = createOfficeConfigurationUseCase({ organizationRepository: organizations,
            officeRepository: offices, unitOfWork: createSqliteUnitOfWork(database), idFactory: nextId });
    });

    afterEach(() => connection.close());

    it('offers the four supported office definitions without provisioning offices by default', async () => {
        expect(OFFICE_CATALOG.map(({ name, slug }) => [name, slug])).toEqual([
            ['Game Development', 'game-development'],
            ['Website Development', 'website-development'],
            ['App Development', 'app-development'],
            ['Research/Making', 'research-making'],
        ]);
        expect(offices.list()).toEqual([]);
        const configured = await configureOffices.run({ organizationId: 'org-094-a', officeSlugs: [] });
        expect(configured.value.offices).toEqual([]);
        expect(offices.list()).toEqual([]);
    });

    it('creates only explicitly enabled offices, is idempotent, and rolls back conflicting configurations', async () => {
        const first = await configureOffices.run({ organizationId: 'org-094-a',
            officeSlugs: ['website-development', 'game-development'] });
        expect(first.ok).toBe(true);
        expect(first.value.offices.map(({ slug }) => slug)).toEqual(['game-development', 'website-development']);
        expect((await configureOffices.run({ organizationId: 'org-094-b', officeSlugs: ['research-making'] }))
            .value.offices.map(({ slug }) => slug)).toEqual(['research-making']);
        expect((await configureOffices.run({ organizationId: 'org-094-a',
            officeSlugs: ['website-development', 'game-development'] })).value.offices).toHaveLength(2);

        const invalid = await configureOffices.run({ organizationId: 'org-094-a',
            officeSlugs: ['app-development', 'not-a-headroom-office'] });
        const duplicate = await configureOffices.run({ organizationId: 'org-094-a',
            officeSlugs: ['app-development', 'app-development'] });
        const conflict = await configureOffices.run({ organizationId: 'org-094-b', officeSlugs: ['website-development'] });
        const missingOrganization = await configureOffices.run({ organizationId: 'org-094-missing', officeSlugs: ['app-development'] });
        expect(invalid.error.code).toBe('invalid-office-configuration');
        expect(duplicate.error.code).toBe('invalid-office-configuration');
        expect(conflict.error.code).toBe('office-configuration-conflict');
        expect(missingOrganization.error.code).toBe('organization-not-found');
        expect(offices.listByOrganization('org-094-a').map(({ slug }) => slug)).toEqual(['game-development', 'website-development']);
        expect(offices.listByOrganization('org-094-b').map(({ slug }) => slug)).toEqual(['research-making']);
    });

    it('scopes departments by office and routes Director work only through the matching Office Head', async () => {
        const configured = await configureOffices.run({ organizationId: 'org-094-a',
            officeSlugs: ['website-development', 'game-development'] });
        const bySlug = new Map(configured.value.offices.map((office) => [office.slug, office]));
        const website = bySlug.get('website-development');
        const game = bySlug.get('game-development');
        departments.create({ id: 'dept-094-web', officeId: website.id, name: 'Web Frontend', slug: 'web-frontend' });
        departments.create({ id: 'dept-094-game', officeId: game.id, name: 'Game Engine', slug: 'game-engine' });
        agents.create({ id: 'director-094', name: 'Director', role: AgentRole.DIRECTOR });
        agents.create({ id: 'head-094-web', name: 'Website Head', role: AgentRole.HEAD_MANAGER, managedOfficeId: website.id });
        agents.create({ id: 'head-094-game', name: 'Game Head', role: AgentRole.HEAD_MANAGER, managedOfficeId: game.id });
        agents.create({ id: 'manager-094-web', name: 'Web Manager', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'dept-094-web' });
        agents.create({ id: 'manager-094-game', name: 'Game Manager', role: AgentRole.DEPT_MANAGER, managedDepartmentId: 'dept-094-game' });
        const hierarchyProvider = { getSnapshot: () => ({ organization: organizations.getById('org-094-a'),
            offices: offices.listByOrganization('org-094-a'),
            departments: [...departments.listByOffice(website.id), ...departments.listByOffice(game.id)],
            agents: agents.list() }) };
        const router = createOfficeHeadRouting({ agentRepository: agents, hierarchyProvider });
        const orchestration = createDirectorOfficeOrchestration({ agentRepository: agents, hierarchyProvider, officeHeadRouting: router });
        const officePlans = [
            { officeId: website.id, headManagerId: 'head-094-web', plan: approvedPlan('web'),
                routes: [{ taskId: 'task-094-web', departmentId: 'dept-094-web' }] },
            { officeId: game.id, headManagerId: 'head-094-game', plan: approvedPlan('game'),
                routes: [{ taskId: 'task-094-game', departmentId: 'dept-094-game' }] },
        ];
        const routed = await orchestration.run({ directorId: 'director-094', officePlans });
        expect(routed.ok).toBe(true);
        expect(routed.value.offices.map(({ officeId, package: routedOffice }) => [officeId, routedOffice.departments[0].departmentId]))
            .toEqual([[website.id, 'dept-094-web'], [game.id, 'dept-094-game']]);
        expect(departments.listByOffice(website.id).map(({ id }) => id)).toEqual(['dept-094-web']);
        expect(departments.listByOffice(game.id).map(({ id }) => id)).toEqual(['dept-094-game']);

        const crossed = await router.run({ plan: officePlans[0].plan, officeId: website.id,
            headManagerId: 'head-094-web', routes: [{ taskId: 'task-094-web', departmentId: 'dept-094-game' }] });
        expect(crossed.error.code).toBe('department-access-denied');
        const messageRouter = createHierarchyMessageRouter({ hierarchyProvider });
        const crossOfficeMessage = await messageRouter.run({ senderId: 'head-094-web', recipientId: 'manager-094-game', message: 'cross-office data' });
        expect(crossOfficeMessage.error.code).toBe('hierarchy-route-forbidden');
    });
});

function approvedPlan(suffix) {
    return { id: `plan-094-${suffix}`, objectiveId: `objective-094-${suffix}`,
        projects: [{ id: `project-094-${suffix}`, name: `${suffix} project` }],
        milestones: [{ id: `milestone-094-${suffix}`, projectId: `project-094-${suffix}`, title: 'Delivery' }],
        tasks: [{ id: `task-094-${suffix}`, taskCode: `TASK-094-${suffix}`, title: `${suffix} work`,
            projectId: `project-094-${suffix}`, milestoneId: `milestone-094-${suffix}`,
            acceptanceCriteria: [{ id: `criterion-094-${suffix}`, description: 'Complete', required: true, met: false }] }],
        dependencies: [],
        approval: { decision: PlanDecision.APPROVED, approverId: 'ceo-094', approverRole: AgentRole.CEO,
            decidedAt: '2026-10-04T00:00:00.000Z' } };
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createOfficeConfigurationUseCase, createOfficeWorkforceConfigurationUseCase } from '../src/application';
import { AgentRole } from '../src/constants';
import { createSqliteUnitOfWork } from '../src/infrastructure';
import { AgentRepository, DepartmentRepository, OfficeRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 095 — office-specific department workforces', () => {
    let connection;
    let database;
    let organizations;
    let offices;
    let departments;
    let agents;
    let configureOffices;
    let configureWorkforces;
    let id;

    beforeEach(async () => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        organizations = new OrganizationRepository(database);
        offices = new OfficeRepository(database);
        departments = new DepartmentRepository(database);
        agents = new AgentRepository(database);
        organizations.create({ id: 'org-095', name: 'Phase 095' });
        id = 0;
        const idFactory = () => `phase095-generated-${++id}`;
        const unitOfWork = createSqliteUnitOfWork(database);
        configureOffices = createOfficeConfigurationUseCase({ organizationRepository: organizations,
            officeRepository: offices, unitOfWork, idFactory });
        configureWorkforces = createOfficeWorkforceConfigurationUseCase({ organizationRepository: organizations,
            officeRepository: offices, departmentRepository: departments, agentRepository: agents, unitOfWork, idFactory });
        await configureOffices.run({ organizationId: 'org-095', officeSlugs: ['website-development', 'game-development'] });
        for (const office of offices.listByOrganization('org-095')) {
            agents.create({ id: `head-${office.slug}`, name: `${office.name} Head`, role: AgentRole.HEAD_MANAGER,
                managedOfficeId: office.id, status: 'IDLE' });
        }
    });

    afterEach(() => connection.close());

    it('creates isolated per-office departments and exactly four specialized employees in each', async () => {
        const result = await configureWorkforces.run({ organizationId: 'org-095', offices: [
            officeConfig('website-development', [{ slug: 'frontend', name: 'Frontend', managerName: 'Web Manager', specializations: ['ui', 'accessibility', 'web-testing', 'performance'] }]),
            officeConfig('game-development', [{ slug: 'engine', name: 'Game Engine', managerName: 'Game Manager', specializations: ['rendering', 'physics', 'gameplay', 'tools'] }]),
        ] });
        expect(result.ok).toBe(true);
        expect(result.value.offices).toHaveLength(2);
        for (const configuredOffice of result.value.offices) {
            expect(configuredOffice.departments).toHaveLength(1);
            expect(configuredOffice.departments[0].employees).toHaveLength(4);
            expect(configuredOffice.departments[0].manager.role).toBe(AgentRole.DEPT_MANAGER);
            expect(new Set(configuredOffice.departments[0].employees.map(({ specialization }) => specialization)).size).toBe(4);
            expect(configuredOffice.departments[0].employees.every(({ departmentId }) => departmentId === configuredOffice.departments[0].id)).toBe(true);
        }
        const allOffices = offices.listByOrganization('org-095');
        const website = allOffices.find(({ slug }) => slug === 'website-development');
        const game = allOffices.find(({ slug }) => slug === 'game-development');
        expect(departments.listByOffice(website.id).map(({ slug }) => slug)).toEqual(['frontend']);
        expect(departments.listByOffice(game.id).map(({ slug }) => slug)).toEqual(['engine']);
    });

    it('rejects missing office configurations, invalid workforce sizes, and unavailable heads without partial writes', async () => {
        const website = offices.listByOrganization('org-095').find(({ slug }) => slug === 'website-development');
        const gameHead = agents.list().find(({ managedOfficeId }) => managedOfficeId !== website.id);
        agents.update(gameHead.id, { status: 'OFFLINE' });
        const oneOffice = await configureWorkforces.run({ organizationId: 'org-095', offices: [
            officeConfig('website-development', [{ slug: 'frontend', name: 'Frontend', managerName: 'Manager', specializations: ['a', 'b', 'c', 'd'] }]),
        ] });
        agents.update(gameHead.id, { status: 'IDLE' });
        const shortRoster = await configureWorkforces.run({ organizationId: 'org-095', offices: [
            officeConfig('website-development', [{ slug: 'frontend', name: 'Frontend', managerName: 'Manager', specializations: ['same', 'same', 'c', 'd'] }]),
            officeConfig('game-development', [{ slug: 'engine', name: 'Engine', managerName: 'Manager', specializations: ['a', 'b', 'c', 'd'] }]),
        ] });
        expect(oneOffice.error.code).toBe('invalid-office-workforce-configuration');
        expect(shortRoster.error.code).toBe('invalid-office-workforce-configuration');
        expect(departments.list()).toEqual([]);
        expect(agents.list()).toHaveLength(2);
    });

    it('refuses to overwrite an office that already has departments', async () => {
        const website = offices.listByOrganization('org-095').find(({ slug }) => slug === 'website-development');
        departments.create({ id: 'dept-existing-095', officeId: website.id, name: 'Existing', slug: 'existing', status: 'ACTIVE' });
        const result = await configureWorkforces.run({ organizationId: 'org-095', offices: [
            officeConfig('website-development', [{ slug: 'new', name: 'New', managerName: 'Manager', specializations: ['a', 'b', 'c', 'd'] }]),
            officeConfig('game-development', [{ slug: 'engine', name: 'Engine', managerName: 'Manager', specializations: ['e', 'f', 'g', 'h'] }]),
        ] });
        expect(result.error.code).toBe('office-workforce-already-configured');
        expect(departments.list()).toHaveLength(1);
        expect(agents.list()).toHaveLength(2);
    });

    it('validates one organization without treating another organization roster as part of its hierarchy', async () => {
        organizations.create({ id: 'org-095-other', name: 'Other organization' });
        await configureOffices.run({ organizationId: 'org-095-other', officeSlugs: ['research-making'] });
        const otherOffice = offices.listByOrganization('org-095-other')[0];
        agents.create({ id: 'head-other-095', name: 'Other Head', role: AgentRole.HEAD_MANAGER,
            managedOfficeId: otherOffice.id, status: 'IDLE' });
        const current = await configureWorkforces.run({ organizationId: 'org-095', offices: [
            officeConfig('website-development', [{ slug: 'frontend', name: 'Frontend', managerName: 'Web Manager', specializations: ['ui', 'a11y', 'testing', 'performance'] }]),
            officeConfig('game-development', [{ slug: 'engine', name: 'Engine', managerName: 'Game Manager', specializations: ['render', 'physics', 'gameplay', 'tools'] }]),
        ] });
        const other = await configureWorkforces.run({ organizationId: 'org-095-other', offices: [
            officeConfig('research-making', [{ slug: 'lab', name: 'Research', managerName: 'Lab Manager', specializations: ['materials', 'prototyping', 'analysis', 'safety'] }]),
        ] });
        expect(current.ok).toBe(true);
        expect(other.ok).toBe(true);
        expect(other.value.offices).toHaveLength(1);
        expect(other.value.offices[0].departments[0].employees).toHaveLength(4);
    });
});

function officeConfig(officeSlug, departments) {
    return { officeSlug, departments: departments.map(({ slug, name, managerName, specializations }) => ({
        slug, name, managerName,
        employees: specializations.map((specialization, index) => ({ name: `${officeSlug}-${index}`, specialization })),
    })) };
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentLifecycleManagement } from '../src/application';
import { assertTaskAssignment, DomainInvariantError, isAgentAvailable, transitionAgentLifecycle } from '../src/domain';
import { AgentRepository, AuditLogRepository, DepartmentRepository, OfficeRepository, OrganizationRepository,
    SqliteConnection, applyMigrations } from '../src/storage';
import { createSqliteUnitOfWork } from '../src/infrastructure';

describe('Phase 120 — personnel lifecycle and assignment eligibility', () => {
    let connection;
    afterEach(() => connection?.close());

    it('enforces the lifecycle transition graph and keeps availability separate', () => {
        expect(transitionAgentLifecycle('ACTIVE', 'SUSPENDED')).toEqual({ lifecycleStatus: 'SUSPENDED', changed: true });
        expect(transitionAgentLifecycle('SUSPENDED', 'ACTIVE')).toEqual({ lifecycleStatus: 'ACTIVE', changed: true });
        expect(transitionAgentLifecycle('ACTIVE', 'ACTIVE')).toEqual({ lifecycleStatus: 'ACTIVE', changed: false });
        expect(() => transitionAgentLifecycle('RETIRED', 'ACTIVE')).toThrow(DomainInvariantError);
        expect(isAgentAvailable({ status: 'IDLE', lifecycleStatus: 'SUSPENDED' })).toBe(false);
        expect(isAgentAvailable({ status: 'OFFLINE', lifecycleStatus: 'ACTIVE' })).toBe(false);
        expect(isAgentAvailable({ status: 'BUSY', lifecycleStatus: 'ACTIVE' })).toBe(true);
    });

    it('persists only valid lifecycle transitions and does not allow generic profile updates to bypass them', () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const agents = new AgentRepository(database);
        agents.create({ id: 'agent-120', name: 'Engineer', role: 'EMPLOYEE' });

        expect(agents.transitionLifecycle('agent-120', 'SUSPENDED').lifecycleStatus).toBe('SUSPENDED');
        expect(agents.transitionLifecycle('agent-120', 'SUSPENDED').lifecycleStatus).toBe('SUSPENDED');
        expect(() => agents.transitionLifecycle('agent-120', 'BOGUS')).toThrow(TypeError);
        expect(agents.transitionLifecycle('agent-120', 'RETIRED').lifecycleStatus).toBe('RETIRED');
        expect(() => agents.transitionLifecycle('agent-120', 'ACTIVE')).toThrow(TypeError);
        expect(agents.update('agent-120', { lifecycleStatus: 'ACTIVE' }).lifecycleStatus).toBe('RETIRED');
    });

    it('rejects task assignment to suspended agents in an otherwise valid hierarchy', () => {
        const hierarchy = {
            organization: { id: 'org-120', name: 'Studio' },
            offices: [{ id: 'office-120', organizationId: 'org-120', name: 'Office', slug: 'office-120', status: 'ACTIVE' }],
            departments: [{ id: 'dept-120', officeId: 'office-120', name: 'Engineering', slug: 'engineering-120', status: 'ACTIVE' }],
            agents: [
                { id: 'ceo-120', name: 'CEO', role: 'CEO', status: 'IDLE' },
                { id: 'director-120', name: 'Director', role: 'DIRECTOR', status: 'IDLE' },
                { id: 'head-120', name: 'Head', role: 'HEAD_MANAGER', managedOfficeId: 'office-120', status: 'IDLE' },
                { id: 'manager-120', name: 'Manager', role: 'DEPT_MANAGER', managedDepartmentId: 'dept-120', status: 'IDLE' },
                { id: 'employee-120', name: 'Engineer', role: 'EMPLOYEE', departmentId: 'dept-120', status: 'IDLE', lifecycleStatus: 'SUSPENDED' },
            ],
        };
        expect(() => assertTaskAssignment({ creatorId: 'manager-120', assigneeId: 'employee-120' }, hierarchy))
            .toThrow(/ACTIVE lifecycle state/);
    });

    it('authorizes lifecycle changes through the persisted CEO and atomically audits the stated reason', async () => {
        const records = new Map([
            ['ceo-120-app', { id: 'ceo-120-app', name: 'CEO', role: 'CEO', status: 'IDLE', lifecycleStatus: 'ACTIVE' }],
            ['employee-120-app', { id: 'employee-120-app', name: 'Engineer', role: 'EMPLOYEE', departmentId: 'dept-120-app', status: 'IDLE', lifecycleStatus: 'ACTIVE' }],
        ]);
        const audits = [];
        let transactionCount = 0;
        const useCase = createAgentLifecycleManagement({
            agentRepository: {
                getById: (id) => records.get(id),
                transitionLifecycle: (id, next) => {
                    const current = records.get(id);
                    const transition = transitionAgentLifecycle(current.lifecycleStatus, next);
                    const updated = { ...current, lifecycleStatus: transition.lifecycleStatus };
                    records.set(id, updated);
                    return updated;
                },
            },
            hierarchyProvider: { getSnapshot: () => ({
                organization: { id: 'org-120-app', name: 'Studio' },
                offices: [{ id: 'office-120-app', organizationId: 'org-120-app', name: 'Office', slug: 'office-120-app', status: 'ACTIVE' }],
                departments: [{ id: 'dept-120-app', officeId: 'office-120-app', name: 'Engineering', slug: 'engineering-120-app', status: 'ACTIVE' }],
                agents: [...records.values()],
            }) },
            auditRepository: { append: (entry) => audits.push(entry) },
            unitOfWork: { run: (operation) => { transactionCount += 1; return operation(); } },
            clock: { now: () => '2026-10-04T00:00:00.000Z' },
            idFactory: () => 'audit-120-agent-lifecycle',
        });

        const result = await useCase.run({ actorId: 'ceo-120-app', agentId: 'employee-120-app',
            lifecycleStatus: 'SUSPENDED', reason: 'Role transition pending review.' });
        expect(result).toMatchObject({ ok: true, value: { lifecycleStatus: 'SUSPENDED', changed: true } });
        expect(transactionCount).toBe(1);
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({ action: 'AGENT_LIFECYCLE_CHANGED', entityId: 'employee-120-app', actorId: 'ceo-120-app',
            details: { from: 'ACTIVE', to: 'SUSPENDED', reason: 'Role transition pending review.' } });
    });

    it('prevents deactivating the only available Director before opening a transaction', async () => {
        const records = new Map([
            ['00000000-0000-4000-8000-000000000121', { id: '00000000-0000-4000-8000-000000000121', name: 'CEO', role: 'CEO', status: 'IDLE', lifecycleStatus: 'ACTIVE', organizationId: 'org-cover-120' }],
            ['00000000-0000-4000-8000-000000000122', { id: '00000000-0000-4000-8000-000000000122', name: 'Director', role: 'DIRECTOR', status: 'IDLE', lifecycleStatus: 'ACTIVE', organizationId: 'org-cover-120' }],
        ]);
        let transactionCount = 0;
        const useCase = createAgentLifecycleManagement({
            agentRepository: { getById: (id) => records.get(id), transitionLifecycle: vi.fn() },
            hierarchyProvider: { getSnapshot: () => ({ organization: { id: 'org-cover-120', name: 'Studio' },
                offices: [], departments: [], agents: [...records.values()] }) },
            auditRepository: { append: vi.fn() },
            unitOfWork: { run: (operation) => { transactionCount += 1; return operation(); } },
            clock: { now: () => new Date() }, idFactory: () => 'audit-cover-120',
        });

        const result = await useCase.run({ actorId: '00000000-0000-4000-8000-000000000121', agentId: '00000000-0000-4000-8000-000000000122',
            lifecycleStatus: 'SUSPENDED', reason: 'No Director coverage replacement is available.' });
        expect(result).toMatchObject({ ok: false, error: { code: 'last-available-role-owner' } });
        expect(transactionCount).toBe(0);
    });

    it('rolls back the persisted transition if its audit append fails', async () => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const organizations = new OrganizationRepository(database);
        const offices = new OfficeRepository(database);
        const departments = new DepartmentRepository(database);
        const agents = new AgentRepository(database);
        organizations.create({ id: 'org-120-atomic', name: 'Atomic Studio' });
        offices.create({ id: 'office-120-atomic', organizationId: 'org-120-atomic', name: 'Office', slug: 'office-120-atomic', status: 'ACTIVE' });
        departments.create({ id: 'dept-120-atomic', officeId: 'office-120-atomic', name: 'Engineering', slug: 'engineering-120-atomic', status: 'ACTIVE' });
        agents.create({ id: 'ceo-120-atomic', name: 'CEO', role: 'CEO', status: 'IDLE' });
        agents.create({ id: 'employee-120-atomic', name: 'Engineer', role: 'EMPLOYEE', departmentId: 'dept-120-atomic', status: 'IDLE' });
        const auditRepository = new AuditLogRepository(database);
        const useCase = createAgentLifecycleManagement({
            agentRepository: agents,
            hierarchyProvider: { getSnapshot: () => ({ organization: organizations.getById('org-120-atomic'),
                offices: offices.listByOrganization('org-120-atomic'), departments: departments.listByOffice('office-120-atomic'),
                agents: agents.list() }) },
            auditRepository: { append: () => { throw new Error('audit storage unavailable'); } },
            unitOfWork: createSqliteUnitOfWork(database), clock: { now: () => new Date() },
            idFactory: () => 'audit-120-atomic',
        });

        const result = await useCase.run({ actorId: 'ceo-120-atomic', agentId: 'employee-120-atomic',
            lifecycleStatus: 'RETIRED', reason: 'Access removed.' });
        expect(result).toMatchObject({ ok: false, error: { code: 'operation-failed' } });
        expect(agents.getById('employee-120-atomic').lifecycleStatus).toBe('ACTIVE');
        expect(auditRepository.listRecent()).toEqual([]);
    });
});

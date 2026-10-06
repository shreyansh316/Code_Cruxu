/** Phase 308 — objective intake requires an active CEO in the same tenant. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createObjectiveIntakeUseCase } from '../src/application/objectiveIntake';
import { AgentRepository, ObjectiveRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';
describe('Phase 308 — CEO objective intake authorization', () => {
    let connection; let objectives; let idFactory; let intake;
    beforeEach(() => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        const organizations = new OrganizationRepository(database);
        organizations.create({ id: 'org-308-a', name: 'A' }); organizations.create({ id: 'org-308-b', name: 'B' });
        const agents = new AgentRepository(database);
        agents.create({ id: 'ceo-308-a', organizationId: 'org-308-a', name: 'CEO A', role: 'CEO', status: 'IDLE' });
        agents.create({ id: 'ceo-308-b', organizationId: 'org-308-b', name: 'CEO B', role: 'CEO', status: 'IDLE' });
        agents.create({ id: 'director-308-a', organizationId: 'org-308-a', name: 'Director', role: 'DIRECTOR', status: 'IDLE' });
        agents.create({ id: 'ceo-308-offline', organizationId: 'org-308-a', name: 'Offline CEO', role: 'CEO', status: 'OFFLINE' });
        objectives = new ObjectiveRepository(database); idFactory = vi.fn(() => 'objective-308');
        intake = createObjectiveIntakeUseCase({ objectiveRepository: objectives, organizationRepository: organizations, agentRepository: agents, idFactory });
    });
    afterEach(() => connection.close());
    const request = (ceoId, organizationId) => ({ ceoId, organizationId, title: 'Implement feature', description: 'Persisted authority.' });
    it('rejects non-CEO, unknown, and inactive identities before writing', async () => {
        for (const ceoId of ['director-308-a', 'ceo-308-offline', 'unknown-308']) expect((await intake.run(request(ceoId, 'org-308-a'))).error.code).toBe('objective-intake-forbidden');
        expect(objectives.list()).toEqual([]); expect(idFactory).not.toHaveBeenCalled();
    });
    it('denies a CEO from another organization', async () => {
        expect((await intake.run(request('ceo-308-a', 'org-308-b'))).error.code).toBe('objective-intake-scope-denied');
        expect(objectives.list()).toEqual([]); expect(idFactory).not.toHaveBeenCalled();
    });
    it('accepts an active CEO in its organization', async () => {
        expect(await intake.run(request('ceo-308-a', 'org-308-a'))).toMatchObject({ ok: true, value: { organizationId: 'org-308-a' } });
    });
});

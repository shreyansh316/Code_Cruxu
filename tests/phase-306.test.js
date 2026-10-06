/** Phase 306 — persisted organization reference checks for objectives. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createObjectiveIntakeUseCase } from '../src/application/objectiveIntake';
import { AgentRepository, ObjectiveRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 306 — objective organization reference integrity', () => {
    let connection; let organizations; let agents; let objectives; let idFactory; let intake;
    beforeEach(() => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        organizations = new OrganizationRepository(database);
        organizations.create({ id: 'org-306', name: 'Organization' });
        agents = new AgentRepository(database);
        agents.create({ id: 'ceo-306', organizationId: 'org-306', name: 'CEO', role: 'CEO', status: 'IDLE' });
        objectives = new ObjectiveRepository(database);
        idFactory = vi.fn(() => 'objective-306');
        intake = createObjectiveIntakeUseCase({ objectiveRepository: objectives, organizationRepository: organizations, agentRepository: agents, idFactory });
    });
    afterEach(() => connection.close());
    it('rejects unknown organization references before generating or persisting an objective', async () => {
        const result = await intake.run({ ceoId: 'ceo-306', organizationId: 'forged-org', title: 'Ship safely', description: 'Deliver agreed work.' });
        expect(result.error.code).toBe('objective-organization-not-found');
        expect(idFactory).not.toHaveBeenCalled();
        expect(objectives.list()).toEqual([]);
    });
    it('stores the canonical ID of an existing organization', async () => {
        const result = await intake.run({ ceoId: 'ceo-306', organizationId: ' org-306 ', title: 'Ship safely', description: 'Deliver agreed work.' });
        expect(result.value.organizationId).toBe('org-306');
    });
});

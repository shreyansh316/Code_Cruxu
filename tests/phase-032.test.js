/** Phase 032 — CEO objective intake use case. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createObjectiveIntakeUseCase } from '../src/application';
import { AgentRepository, ObjectiveRepository, OrganizationRepository, SqliteConnection, applyMigrations } from '../src/storage';

describe('Phase 032 — objective intake', () => {
    let connection;
    let repository;
    let organizationRepository;
    let agentRepository;
    let idFactory;
    let useCase;
    beforeEach(() => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        organizationRepository = new OrganizationRepository(database);
        organizationRepository.create({ id: 'organization-intake-1', name: 'Intake Organization' });
        agentRepository = new AgentRepository(database);
        agentRepository.create({ id: 'ceo-intake-1', organizationId: 'organization-intake-1', name: 'CEO', role: 'CEO', status: 'IDLE' });
        repository = new ObjectiveRepository(database);
        idFactory = vi.fn(() => 'objective-intake-1');
        useCase = createObjectiveIntakeUseCase({ objectiveRepository: repository, organizationRepository, agentRepository, idFactory });
    });
    afterEach(() => connection.close());

    it('validates, initializes, and persists a valid objective request', async () => {
        const result = await useCase.run({ ceoId: 'ceo-intake-1', organizationId: 'organization-intake-1',
            title: '  Ship feature  ', description: '  Deliver the approved scope.  ' });
        expect(result).toMatchObject({ ok: true, value: {
            id: 'objective-intake-1', organizationId: 'organization-intake-1', title: 'Ship feature', description: 'Deliver the approved scope.',
            status: 'NEW', priority: 0,
        } });
        expect(repository.getById('objective-intake-1')).toEqual(result.value);
        expect(idFactory).toHaveBeenCalledTimes(1);
    });

    it('returns actionable validation errors without fabricating or persisting objectives', async () => {
        for (const input of [
            null,
            { organizationId: 'organization-intake-1', title: '', description: 'Details' },
            { organizationId: 'organization-intake-1', title: 'Title', description: '   ' },
            { organizationId: 'organization-intake-1', title: 'x'.repeat(201), description: 'Details' },
            { organizationId: 'organization-intake-1', title: 'Title', description: 'x'.repeat(10_001) },
        ]) {
            const result = await useCase.run(input);
            expect(result.ok).toBe(false);
            expect(result.error.message).toMatch(/Objective (title|description)/);
        }
        expect(repository.list()).toEqual([]);
        expect(idFactory).not.toHaveBeenCalled();
    });

    it('rejects missing dependencies and reports invalid generated identifiers', async () => {
        expect(() => createObjectiveIntakeUseCase({ objectiveRepository: repository })).toThrow();
        const invalidIdUseCase = createObjectiveIntakeUseCase({ objectiveRepository: repository, organizationRepository,
            agentRepository, idFactory: () => '  ' });
        expect(await invalidIdUseCase.run({ organizationId: 'organization-intake-1', title: 'Title', description: 'Description' })).toMatchObject({
            ok: false, error: { code: 'invalid-identifier' },
        });
    });
});

/** Phase 356 — auditable user notes remain unverified until reviewed. */
import { describe, expect, it, vi } from 'vitest';
import { createMemoryNoteUseCase } from '../src/application';

describe('Phase 356 — user-authored memory notes', () => {
    it('authorizes, redacts, persists as unverified, and audits the note in one unit of work', async () => {
        const memoryRepository = { create: vi.fn((note) => note) };
        const auditRepository = { append: vi.fn() };
        const unitOfWork = { run: vi.fn((operation) => operation()) };
        const useCase = createMemoryNoteUseCase({ memoryRepository, auditRepository, unitOfWork,
            authorize: vi.fn(() => true), idFactory: (() => { let id = 0; return () => `note-356-${++id}`; })() });
        const result = await useCase.run({ actorId: 'agent-356', actorRole: 'CEO', scope: 'TASK', ownerId: 'task-356',
            title: 'Build cache', content: 'Keep token=note-secret out of generated context.', importance: 2 });
        expect(result.ok).toBe(true);
        expect(memoryRepository.create).toHaveBeenCalledWith(expect.objectContaining({ scope: 'TASK', taskId: 'task-356',
            verified: 0, sourceKind: 'USER_NOTE', sourceReference: 'memory-note:note-356-1' }));
        expect(memoryRepository.create.mock.calls[0][0].content).not.toContain('note-secret');
        expect(auditRepository.append).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'agent-356',
            action: 'MEMORY_NOTE_CREATED', entityId: 'note-356-1', details: { scope: 'TASK', ownerId: 'task-356', sourceKind: 'USER_NOTE' } }));
        expect(unitOfWork.run).toHaveBeenCalledOnce();
    });

    it('fails closed on unauthorized, mismatched owner, or requested verification', async () => {
        const useCase = createMemoryNoteUseCase({ memoryRepository: { create: vi.fn() }, auditRepository: { append: vi.fn() },
            unitOfWork: { run: (operation) => operation() }, authorize: () => false, idFactory: () => 'note-356' });
        expect((await useCase.run({ actorId: 'agent-356', actorRole: 'CEO', scope: 'TASK', ownerId: 'task-356',
            title: 'Note', content: 'Content' })).error.code).toBe('memory-note-forbidden');
        expect((await useCase.run({ actorId: 'agent-356', actorRole: 'CEO', scope: 'TASK', ownerType: 'projectId',
            ownerId: 'task-356', title: 'Note', content: 'Content' })).error.code).toBe('invalid-memory-note');
        const authorized = createMemoryNoteUseCase({ memoryRepository: { create: (note) => note }, auditRepository: { append: vi.fn() },
            unitOfWork: { run: (operation) => operation() }, authorize: () => true, idFactory: () => 'note-356' });
        expect((await authorized.run({ actorId: 'agent-356', actorRole: 'CEO', scope: 'TASK', ownerId: 'task-356',
            title: 'Note', content: 'Content', verified: true })).value).toMatchObject({ verified: 0 });
    });
});

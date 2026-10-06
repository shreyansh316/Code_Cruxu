/** Phase 354 — memory source provenance and verification attribution. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleBoundedAgentContext } from '../src/application/contextAssembly';
import { MemoryRepository, OrganizationRepository, SqliteConnection, applyMigrations, SCHEMA_MIGRATIONS } from '../src/storage';

describe('Phase 354 — memory provenance', () => {
    let connection;
    let database;
    let memories;
    beforeEach(() => {
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database);
        new OrganizationRepository(database).create({ id: 'org-354', name: 'Organization' });
        memories = new MemoryRepository(database);
    });
    afterEach(() => connection.close());

    const memory = (id, extra = {}) => ({ id, scope: 'CEO', organizationId: 'org-354', title: id,
        content: `Content ${id}`, importance: 2, ...extra });
    const attribution = { verified: 1, sourceKind: 'TEST_RESULT', sourceReference: 'run:ci-354',
        verifiedByAgentId: 'agent-reviewer', verifiedAt: '2026-10-06T00:00:00.000Z', verificationNote: 'Regression suite passed.' };

    it('persists verifiable source and reviewer metadata and returns it in AI context', () => {
        const saved = memories.create(memory('verified-354', attribution));
        expect(saved).toMatchObject({ sourceKind: 'TEST_RESULT', sourceReference: 'run:ci-354',
            verifiedByAgentId: 'agent-reviewer', verifiedAt: attribution.verifiedAt,
            verificationNote: 'Regression suite passed.', verified: 1 });
        const context = assembleBoundedAgentContext({ memoryRepository: memories, authorize: () => true }, {
            actor: { id: 'agent-context', role: 'CEO' }, scope: 'CEO', ownerId: 'org-354',
        });
        expect(context.items[0]).toMatchObject({ verified: true, sourceKind: 'TEST_RESULT',
            sourceReference: 'run:ci-354', verifiedByAgentId: 'agent-reviewer', verifiedAt: attribution.verifiedAt });
        expect(() => memories.update(saved.id, { verifiedByAgentId: 'agent-replacement' })).toThrow(/attribution is immutable/);
        expect(() => memories.update(saved.id, { verified: 0 })).toThrow(/state cannot be downgraded/);
        expect(() => memories.update(saved.id, { content: 'tampered after verification' })).toThrow(/content cannot be changed/);
        memories.create(memory('note-354', { sourceKind: 'USER_NOTE' }));
        const testOnly = assembleBoundedAgentContext({ memoryRepository: memories, authorize: () => true }, {
            actor: { id: 'agent-context', role: 'CEO' }, scope: 'CEO', ownerId: 'org-354', sourceKinds: ['TEST_RESULT'],
        });
        expect(testOnly.items.map(({ id }) => id)).toEqual(['verified-354']);
    });

    it('keeps unverified AI-generated claims explicitly unverified', () => {
        expect(memories.create(memory('ai-note-354', { sourceKind: 'AI_GENERATED' })))
            .toMatchObject({ sourceKind: 'AI_GENERATED', verified: 0, verifiedByAgentId: null });
        expect(() => memories.create(memory('ai-verified-354', { ...attribution, sourceKind: 'AI_GENERATED' })))
            .toThrow(/non-AI source reference/);
    });

    it('rejects verification without attribution and prevents source evidence edits', () => {
        expect(() => memories.create(memory('missing-attribution-354', { verified: 1 })))
            .toThrow(/non-AI source reference/);
        const saved = memories.create(memory('immutable-source-354', attribution));
        expect(() => memories.update(saved.id, { sourceReference: 'changed:after-review' })).toThrow(/immutable/);
        expect(() => database.prepare('UPDATE memories SET verified = 1 WHERE id = ?').run('immutable-source-354'))
            .not.toThrow();
    });

    it('redacts secrets from persisted evidence references and reviewer notes', () => {
        const saved = memories.create(memory('redacted-provenance-354', { ...attribution,
            sourceReference: 'https://user:password-secret@example.test/run',
            verificationNote: 'Checked with token=verification-secret' }));
        expect(saved.sourceReference).not.toContain('password-secret');
        expect(saved.verificationNote).not.toContain('verification-secret');
    });

    it('labels pre-provenance rows with unknown legacy provenance', () => {
        connection.close();
        connection = new SqliteConnection();
        database = connection.open(':memory:');
        applyMigrations(database, SCHEMA_MIGRATIONS.slice(0, 24));
        new OrganizationRepository(database).create({ id: 'org-354', name: 'Organization' });
        database.prepare(`INSERT INTO memories (id, scope, title, content, organization_id, verified)
          VALUES (?, 'CEO', ?, ?, ?, 1)`).run('legacy-354', 'Legacy', 'Old record', 'org-354');
        applyMigrations(database);
        memories = new MemoryRepository(database);
        const legacy = memories.getById('legacy-354');
        expect(legacy).toMatchObject({ verified: 1, sourceKind: 'LEGACY', sourceReference: null, verifiedAt: null });
        const context = assembleBoundedAgentContext({ memoryRepository: memories, authorize: () => true }, {
            actor: { id: 'agent-context', role: 'CEO' }, scope: 'CEO', ownerId: 'org-354',
        });
        expect(context.items[0]).toMatchObject({ verified: false, sourceKind: 'LEGACY' });
    });
});

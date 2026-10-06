import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { SqliteConnection } from '../src/storage/SqliteConnection';
import { applyMigrations } from '../src/storage/migrations';
import { MemoryRepository, OrganizationRepository } from '../src/storage/repositories/CoreRepositories';
import { retrieveScopedMemories } from '../src/domain/memoryRetrieval';
import { createTaskScheduler } from '../src/application/taskScheduler';
import { HeadroomContext } from '../src/core/HeadroomContext';

const SAMPLES = 30;
const WARMUPS = 5;

describe('Phase 079 reproducible performance baselines', () => {
    it('measures database, scoped retrieval, bounded scheduling, and extension activation paths', async () => {
        const databaseConnection = new SqliteConnection();
        const database = databaseConnection.open(':memory:');
        applyMigrations(database);
        const organizationRepository = new OrganizationRepository(database);
        organizationRepository.create({ id: 'organization-benchmark', name: 'Benchmark' });
        const memoryRepository = new MemoryRepository(database);
        const insertMemory = database.prepare(`INSERT INTO memories
          (id, scope, category, title, content, importance, verified, organization_id, source_kind,
           source_reference, verified_by_agent_id, verified_at, verification_note)
          VALUES (?, 'CEO', ?, ?, ?, 2, 1, 'organization-benchmark', 'USER_NOTE',
           'benchmark:phase-079', 'benchmark-agent', '2026-01-01T00:00:00.000Z', 'Benchmark fixture')`);
        database.prepare("INSERT INTO agents (id, organization_id, name, role) VALUES ('benchmark-agent', 'organization-benchmark', 'Benchmark', 'CEO')").run();
        const memoryFixtureSize = 1000;
        for (let index = 0; index < memoryFixtureSize; index += 1) {
            const id = `memory-bench-${String(index).padStart(4, '0')}`;
            insertMemory.run(id, index % 2 ? 'notes' : 'database', `Migration note ${index}`,
                `HEADROOM SQLite migration fixture ${index} confirms bounded deterministic retrieval.`);
        }

        let writeCount = 0;
        const databaseReadWrite = () => {
            const id = `organization-write-${String(writeCount++).padStart(6, '0')}`;
            organizationRepository.create({ id, name: 'Performance sample' });
            return organizationRepository.getById(id);
        };
        const scopedRetrieval = () => {
            const owned = memoryRepository.listByOwner('CEO', 'organization-benchmark', { limit: 100 });
            return retrieveScopedMemories(owned, { scope: 'CEO', ownerId: 'organization-benchmark',
                query: 'SQLite migration', verifiedOnly: true, limit: 10 });
        };

        const candidates = Array.from({ length: 100 }, (_, index) => ({ task: { id: `task-bench-${index}` } }));
        const scheduling = () => createTaskScheduler({
            queueWorkflow: { run: async () => ({ ok: true, value: { ready: candidates } }) },
            queueRepository: { transition: () => true },
            executor: { execute: async () => undefined },
            executionControl: { status: 'RUNNING', pause() {}, resume() {}, cancel() {} },
            parallelLimit: 4,
        }).run();

        const activationRoot = mkdtempSync(join(tmpdir(), 'headroom-079-'));
        let activationCount = 0;
        const activation = async () => {
            const storage = join(activationRoot, `activation-${activationCount++}`);
            const context = new HeadroomContext({ subscriptions: [],
                globalState: { get: () => true, update: async () => undefined },
                globalStorageUri: { fsPath: storage } });
            await context.initialize();
            context.dispose();
        };

        try {
            const report = {
                schemaVersion: 1,
                generatedAt: new Date().toISOString(),
                environment: { node: process.version, platform: process.platform, arch: process.arch },
                fixtures: { sqlite: 'in-memory', memoryRecords: memoryFixtureSize, retrievalCandidateLimit: 100,
                    retrievalResultLimit: 10, schedulerReadyTasks: candidates.length, schedulerConcurrency: 4,
                    activation: 'new extension-owned SQLite database with repository-backed views and command registration' },
                samples: SAMPLES,
                warmups: WARMUPS,
                results: {
                    sqliteReadWrite: await measure(databaseReadWrite),
                    scopedMemoryRetrieval: await measure(scopedRetrieval),
                    schedulerBatch: await measure(scheduling),
                    extensionActivation: await measure(activation, { samples: 15, warmups: 3 }),
                },
            };
            expect(report.results.sqliteReadWrite.medianMs).toBeGreaterThanOrEqual(0);
            expect(report.results.scopedMemoryRetrieval.medianMs).toBeGreaterThanOrEqual(0);
            expect(report.results.schedulerBatch.medianMs).toBeGreaterThanOrEqual(0);
            expect(report.results.extensionActivation.medianMs).toBeGreaterThanOrEqual(0);
            console.log(`HEADROOM_BENCHMARK_JSON=${JSON.stringify(report)}`);
        } finally {
            databaseConnection.close();
            rmSync(activationRoot, { recursive: true, force: true });
        }
    }, 120_000);
});

async function measure(operation, { samples = SAMPLES, warmups = WARMUPS } = {}) {
    for (let index = 0; index < warmups; index += 1) await operation();
    const values = [];
    for (let index = 0; index < samples; index += 1) {
        const start = performance.now();
        await operation();
        values.push(performance.now() - start);
    }
    values.sort((left, right) => left - right);
    return Object.freeze({ samples, medianMs: round(percentile(values, 0.5)), p95Ms: round(percentile(values, 0.95)) });
}

function percentile(sortedValues, percentileValue) {
    return sortedValues[Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * percentileValue) - 1)];
}

function round(value) { return Math.round(value * 1000) / 1000; }

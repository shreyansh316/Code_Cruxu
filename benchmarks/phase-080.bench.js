import { performance } from 'node:perf_hooks';
import { SqliteConnection, applyMigrations } from '../src/storage';

const ROWS_PER_TABLE = 3000;
const SAMPLES = 50;
const LIMIT = 100;
const LOCAL_P95_LIMIT_MS = 10;

describe('Phase 080 query path benchmark', () => {
    it('keeps indexed owner and attribution lookups within local fixture limits', () => {
        const connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        database.prepare("INSERT INTO organizations (id, name) VALUES ('bench-org', 'Bench')").run();
        database.prepare("INSERT INTO organizations (id, name) VALUES ('bench-other-org', 'Other')").run();
        database.prepare("INSERT INTO agents (id, name, role) VALUES ('bench-agent', 'Bench Agent', 'CEO')").run();
        const insertMemory = database.prepare(`INSERT INTO memories
          (id, scope, category, title, content, importance, verified, organization_id)
          VALUES (?, 'CEO', 'benchmark', 'fixture', 'bounded query fixture', 1, 1, ?)`);
        const insertOtherMemory = database.prepare(`INSERT INTO memories
          (id, scope, category, title, content, importance, verified, organization_id)
          VALUES (?, 'CEO', 'benchmark', 'fixture', 'other-owner fixture', 1, 1, 'bench-other-org')`);
        const insertUsage = database.prepare(`INSERT INTO ai_usages
          (id, agent_id, model, input_tokens, output_tokens, estimated_cost, duration_ms)
          VALUES (?, 'bench-agent', 'fixture', 1, 1, 0, 1)`);
        const insertAudit = database.prepare(`INSERT INTO audit_logs (id, action, entity, entity_id, task_id, details)
          VALUES (?, 'BENCH', 'task', ?, 'bench-task', '{}')`);
        const transaction = database.transaction(() => {
            for (let index = 0; index < ROWS_PER_TABLE; index += 1) {
                const id = String(index).padStart(5, '0');
                insertMemory.run(`owned-${id}`, 'bench-org');
                insertOtherMemory.run(`other-${id}`);
                insertUsage.run(`usage-${id}`);
                insertAudit.run(`audit-${id}`, `entity-${id}`);
            }
        });
        transaction();

        const queries = {
            memoryOwner: () => database.prepare(`SELECT * FROM memories WHERE scope = 'CEO'
              AND organization_id = 'bench-org' ORDER BY created_at, id LIMIT ?`).all(LIMIT),
            agentUsage: () => database.prepare(`SELECT * FROM ai_usages WHERE agent_id = 'bench-agent'
              ORDER BY created_at, rowid LIMIT ?`).all(LIMIT),
            taskAudit: () => database.prepare(`SELECT * FROM audit_logs WHERE task_id = 'bench-task'
              ORDER BY created_at, rowid LIMIT ?`).all(LIMIT),
        };
        try {
            const results = Object.fromEntries(Object.entries(queries).map(([name, query]) => [name, measure(query)]));
            for (const result of Object.values(results)) expect(result.p95Ms).toBeLessThan(LOCAL_P95_LIMIT_MS);
            console.log(`HEADROOM_QUERY_BENCHMARK_JSON=${JSON.stringify({
                schemaVersion: 1, generatedAt: new Date().toISOString(),
                environment: { node: process.version, platform: process.platform, arch: process.arch },
                fixture: { rowsPerTable: ROWS_PER_TABLE, otherOwnerMemoryRows: ROWS_PER_TABLE, resultLimit: LIMIT },
                samples: SAMPLES, localP95LimitMs: LOCAL_P95_LIMIT_MS, results,
            })}`);
        } finally {
            connection.close();
        }
    });
});

function measure(query) {
    for (let index = 0; index < 10; index += 1) query();
    const values = [];
    for (let index = 0; index < SAMPLES; index += 1) {
        const start = performance.now();
        query();
        values.push(performance.now() - start);
    }
    values.sort((a, b) => a - b);
    const percentile = (ratio) => values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)];
    return { medianMs: round(percentile(0.5)), p95Ms: round(percentile(0.95)) };
}

function round(value) { return Math.round(value * 1000) / 1000; }

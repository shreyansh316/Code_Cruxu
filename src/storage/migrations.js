import { initializeCoreSchema } from './schema';
export class SqliteMigrationError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = 'SqliteMigrationError';
    }
}
/** Initial, canonical relational schema defined in Phase 003. */
export const SCHEMA_MIGRATIONS = [
    {
        version: 1,
        name: 'initial-core-schema',
        up: initializeCoreSchema,
    },
    {
        version: 2,
        name: 'durable-event-delivery',
        up: (database) => {
            database.exec(`
              ALTER TABLE events ADD COLUMN event_version INTEGER NOT NULL DEFAULT 1 CHECK (event_version > 0);
              ALTER TABLE events ADD COLUMN aggregate_id TEXT NOT NULL DEFAULT '';
              ALTER TABLE events ADD COLUMN occurred_at TEXT NOT NULL DEFAULT '';
              UPDATE events SET aggregate_id = id, occurred_at = created_at
                WHERE aggregate_id = '' OR occurred_at = '';
              CREATE TABLE event_deliveries (
                event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
                subscriber_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
                attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
                error TEXT,
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                PRIMARY KEY (event_id, subscriber_id)
              );
              CREATE INDEX idx_event_deliveries_status ON event_deliveries(status, updated_at);
            `);
        },
    },
    {
        version: 3,
        name: 'memory-scope-ownership',
        up: (database) => database.exec(`
          CREATE TRIGGER memories_scope_owner_insert BEFORE INSERT ON memories
          WHEN NOT (
            (NEW.scope IN ('CEO', 'DIRECTOR') AND NEW.organization_id IS NOT NULL
              AND NEW.office_id IS NULL AND NEW.department_id IS NULL AND NEW.task_id IS NULL
              AND NEW.project_id IS NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope = 'OFFICE' AND NEW.office_id IS NOT NULL
              AND NEW.organization_id IS NULL AND NEW.department_id IS NULL AND NEW.task_id IS NULL
              AND NEW.project_id IS NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope = 'DEPARTMENT' AND NEW.department_id IS NOT NULL
              AND NEW.organization_id IS NULL AND NEW.office_id IS NULL AND NEW.task_id IS NULL
              AND NEW.project_id IS NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope = 'TASK' AND NEW.task_id IS NOT NULL
              AND NEW.organization_id IS NULL AND NEW.office_id IS NULL AND NEW.department_id IS NULL
              AND NEW.project_id IS NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope = 'PROJECT' AND NEW.project_id IS NOT NULL
              AND NEW.organization_id IS NULL AND NEW.office_id IS NULL AND NEW.department_id IS NULL
              AND NEW.task_id IS NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope IN ('DECISION', 'KNOWLEDGE') AND
              ((NEW.organization_id IS NOT NULL) + (NEW.office_id IS NOT NULL) + (NEW.department_id IS NOT NULL)
               + (NEW.task_id IS NOT NULL) + (NEW.project_id IS NOT NULL) + (NEW.objective_id IS NOT NULL)) = 1)
          )
          BEGIN SELECT RAISE(ABORT, 'memory scope owner mismatch'); END;

          CREATE TRIGGER memories_scope_owner_update BEFORE UPDATE OF scope, organization_id, office_id,
            department_id, task_id, project_id, objective_id ON memories
          WHEN NOT (
            (NEW.scope IN ('CEO', 'DIRECTOR') AND NEW.organization_id IS NOT NULL
              AND NEW.office_id IS NULL AND NEW.department_id IS NULL AND NEW.task_id IS NULL
              AND NEW.project_id IS NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope = 'OFFICE' AND NEW.office_id IS NOT NULL
              AND NEW.organization_id IS NULL AND NEW.department_id IS NULL AND NEW.task_id IS NULL
              AND NEW.project_id IS NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope = 'DEPARTMENT' AND NEW.department_id IS NOT NULL
              AND NEW.organization_id IS NULL AND NEW.office_id IS NULL AND NEW.task_id IS NULL
              AND NEW.project_id IS NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope = 'TASK' AND NEW.task_id IS NOT NULL
              AND NEW.organization_id IS NULL AND NEW.office_id IS NULL AND NEW.department_id IS NULL
              AND NEW.project_id IS NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope = 'PROJECT' AND NEW.project_id IS NOT NULL
              AND NEW.organization_id IS NULL AND NEW.office_id IS NULL AND NEW.department_id IS NULL
              AND NEW.task_id IS NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope IN ('DECISION', 'KNOWLEDGE') AND
              ((NEW.organization_id IS NOT NULL) + (NEW.office_id IS NOT NULL) + (NEW.department_id IS NOT NULL)
               + (NEW.task_id IS NOT NULL) + (NEW.project_id IS NOT NULL) + (NEW.objective_id IS NOT NULL)) = 1)
          )
          BEGIN SELECT RAISE(ABORT, 'memory scope owner mismatch'); END;
        `),
    },
    {
        version: 4,
        name: 'append-only-audit-records',
        up: (database) => database.exec(`
          DROP INDEX IF EXISTS idx_audit_entity;
          ALTER TABLE audit_logs RENAME TO audit_logs_legacy;
          CREATE TABLE audit_logs (
            id TEXT PRIMARY KEY NOT NULL,
            action TEXT NOT NULL,
            entity TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            agent_id TEXT,
            task_id TEXT,
            details TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          );
          INSERT INTO audit_logs (id, action, entity, entity_id, agent_id, task_id, details, created_at)
            SELECT id, action, entity, entity_id, agent_id, task_id, details, created_at FROM audit_logs_legacy;
          DROP TABLE audit_logs_legacy;
          CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id, created_at);
          CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs
            BEGIN SELECT RAISE(ABORT, 'audit records are append-only'); END;
          CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
            BEGIN SELECT RAISE(ABORT, 'audit records are append-only'); END;
        `),
    },
    {
        version: 5,
        name: 'durable-execution-queue',
        up: (database) => database.exec(`
          CREATE TABLE execution_queue (
            id TEXT PRIMARY KEY NOT NULL,
            task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
            state TEXT NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED', 'CLAIMED', 'COMPLETED', 'CANCELLED')),
            queued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          );
          CREATE INDEX idx_execution_queue_ready ON execution_queue(state, queued_at, task_id);
        `),
    },
    {
        version: 6,
        name: 'ai-usage-request-correlation',
        up: (database) => database.exec(`
          ALTER TABLE ai_usages ADD COLUMN request_id TEXT;
          ALTER TABLE ai_usages ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0);
          CREATE UNIQUE INDEX idx_ai_usages_request_attempt ON ai_usages(request_id, attempt)
            WHERE request_id IS NOT NULL;
        `),
    },
    {
        version: 7,
        name: 'audited-data-retention',
        up: (database) => database.exec(`
          CREATE TABLE retention_runs (
            id TEXT PRIMARY KEY NOT NULL,
            cutoff_at TEXT NOT NULL,
            memory_deleted INTEGER NOT NULL CHECK (memory_deleted >= 0),
            usage_deleted INTEGER NOT NULL CHECK (usage_deleted >= 0),
            audit_deleted INTEGER NOT NULL CHECK (audit_deleted >= 0),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          );
          CREATE TRIGGER retention_runs_no_update BEFORE UPDATE ON retention_runs
            BEGIN SELECT RAISE(ABORT, 'retention records are immutable'); END;
          CREATE TRIGGER retention_runs_no_delete BEFORE DELETE ON retention_runs
            BEGIN SELECT RAISE(ABORT, 'retention records are immutable'); END;
          CREATE TABLE retention_state (id INTEGER PRIMARY KEY CHECK (id = 1), active INTEGER NOT NULL CHECK (active IN (0, 1)));
          INSERT INTO retention_state (id, active) VALUES (1, 0);
          DROP TRIGGER audit_logs_no_delete;
          CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs
            WHEN NOT EXISTS (SELECT 1 FROM retention_state WHERE id = 1 AND active = 1)
            BEGIN SELECT RAISE(ABORT, 'audit records are append-only'); END;
        `),
    },
    {
        version: 8,
        name: 'owner-and-attribution-query-indexes',
        up: (database) => database.exec(`
          CREATE INDEX idx_memories_owner_organization ON memories(scope, organization_id, created_at, id) WHERE organization_id IS NOT NULL;
          CREATE INDEX idx_memories_owner_office ON memories(scope, office_id, created_at, id) WHERE office_id IS NOT NULL;
          CREATE INDEX idx_memories_owner_department ON memories(scope, department_id, created_at, id) WHERE department_id IS NOT NULL;
          CREATE INDEX idx_memories_owner_task ON memories(scope, task_id, created_at, id) WHERE task_id IS NOT NULL;
          CREATE INDEX idx_memories_owner_project ON memories(scope, project_id, created_at, id) WHERE project_id IS NOT NULL;
          CREATE INDEX idx_memories_owner_objective ON memories(scope, objective_id, created_at, id) WHERE objective_id IS NOT NULL;
          CREATE INDEX idx_ai_usages_agent_created ON ai_usages(agent_id, created_at) WHERE agent_id IS NOT NULL;
          CREATE INDEX idx_audit_task_created ON audit_logs(task_id, created_at) WHERE task_id IS NOT NULL;
        `),
    },
    {
        version: 9,
        name: 'agent-capabilities',
        up: (database) => database.exec(`
          ALTER TABLE agents ADD COLUMN capabilities_json TEXT NOT NULL DEFAULT '[]';
        `),
    },
    {
        version: 10,
        name: 'agent-lifecycle-state',
        up: (database) => database.exec(`
          ALTER TABLE agents ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE'
            CHECK (lifecycle_status IN ('ACTIVE', 'SUSPENDED', 'RETIRED'));
        `),
    },
    {
        version: 11,
        name: 'organization-owned-executives-and-objectives',
        up: (database) => database.exec(`
          ALTER TABLE agents ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
          ALTER TABLE objectives ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
          CREATE INDEX idx_agents_organization ON agents(organization_id, role, id) WHERE organization_id IS NOT NULL;
          CREATE INDEX idx_objectives_organization ON objectives(organization_id, status, id) WHERE organization_id IS NOT NULL;

          UPDATE agents SET organization_id = (
            SELECT organization_id FROM offices WHERE offices.id = agents.managed_office_id
          ) WHERE managed_office_id IS NOT NULL;
          UPDATE agents SET organization_id = (
            SELECT offices.organization_id FROM departments
            JOIN offices ON offices.id = departments.office_id
            WHERE departments.id = agents.managed_department_id
          ) WHERE managed_department_id IS NOT NULL;
          UPDATE agents SET organization_id = (
            SELECT offices.organization_id FROM departments
            JOIN offices ON offices.id = departments.office_id
            WHERE departments.id = agents.department_id
          ) WHERE department_id IS NOT NULL;

          UPDATE agents SET organization_id = (SELECT id FROM organizations)
            WHERE role IN ('CEO', 'DIRECTOR') AND (SELECT COUNT(*) FROM organizations) = 1;
          UPDATE objectives SET organization_id = (SELECT id FROM organizations)
            WHERE (SELECT COUNT(*) FROM organizations) = 1;
        `),
    },
    {
        version: 12,
        name: 'task-required-capabilities',
        up: (database) => database.exec(`
          ALTER TABLE tasks ADD COLUMN required_capabilities_json TEXT NOT NULL DEFAULT '[]';
        `),
    },
];
const CREATE_MIGRATION_LEDGER_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL CHECK (version > 0),
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`;
/**
 * Apply pending migrations in ascending version order and return the current
 * schema version. Ledger writes and all pending schema changes share one
 * transaction, so a failed migration advances neither schema nor ledger.
 */
export function applyMigrations(database, migrations = SCHEMA_MIGRATIONS) {
    validateMigrations(migrations);
    try {
        database.pragma('foreign_keys = ON');
        return database.transaction(() => {
            database.exec(CREATE_MIGRATION_LEDGER_SQL);
            const applied = database.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
            if (applied.length > migrations.length) {
                throw new SqliteMigrationError(`Database has ${applied.length} migration records but only ${migrations.length} migrations are available.`);
            }
            for (let index = 0; index < applied.length; index += 1) {
                const record = applied[index];
                const migration = migrations[index];
                if (record.version !== migration.version || record.name !== migration.name) {
                    throw new SqliteMigrationError(`Migration history mismatch at version ${migration.version}.`);
                }
            }
            const insertMigration = database.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');
            for (const migration of migrations.slice(applied.length)) {
                migration.up(database);
                insertMigration.run(migration.version, migration.name);
            }
            return migrations.at(-1)?.version ?? 0;
        })();
    }
    catch (cause) {
        if (cause instanceof SqliteMigrationError)
            throw cause;
        throw new SqliteMigrationError('Failed to apply SQLite schema migrations.', { cause });
    }
}
function validateMigrations(migrations) {
    for (let index = 0; index < migrations.length; index += 1) {
        const migration = migrations[index];
        const expectedVersion = index + 1;
        if (migration.version !== expectedVersion) {
            throw new SqliteMigrationError(`Migration versions must be contiguous and start at 1; expected ${expectedVersion}, got ${migration.version}.`);
        }
        if (!migration.name.trim()) {
            throw new SqliteMigrationError(`Migration ${migration.version} must have a name.`);
        }
    }
}

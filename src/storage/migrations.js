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
    {
        version: 13,
        name: 'memory-expiration',
        up: (database) => database.exec(`
          ALTER TABLE memories ADD COLUMN expires_at TEXT;
          CREATE INDEX idx_memories_expiration ON memories(expires_at, id) WHERE expires_at IS NOT NULL;
        `),
    },
    {
        version: 14,
        name: 'memory-owner-immutability',
        up: (database) => database.exec(`
          CREATE TRIGGER memories_owner_immutable BEFORE UPDATE OF scope, organization_id, office_id, department_id,
            task_id, project_id, objective_id ON memories
          WHEN NEW.scope IS NOT OLD.scope OR NEW.organization_id IS NOT OLD.organization_id
            OR NEW.office_id IS NOT OLD.office_id OR NEW.department_id IS NOT OLD.department_id
            OR NEW.task_id IS NOT OLD.task_id OR NEW.project_id IS NOT OLD.project_id
            OR NEW.objective_id IS NOT OLD.objective_id
          BEGIN SELECT RAISE(ABORT, 'memory scope owner mismatch: ownership is immutable'); END;
        `),
    },
    {
        version: 15,
        name: 'organization-owner-immutability',
        up: (database) => database.exec(`
          CREATE TRIGGER agents_organization_immutable BEFORE UPDATE OF organization_id ON agents
          WHEN OLD.organization_id IS NOT NULL AND NEW.organization_id IS NOT OLD.organization_id
          BEGIN SELECT RAISE(ABORT, 'agent organization ownership is immutable'); END;

          CREATE TRIGGER objectives_organization_immutable BEFORE UPDATE OF organization_id ON objectives
          WHEN OLD.organization_id IS NOT NULL AND NEW.organization_id IS NOT OLD.organization_id
          BEGIN SELECT RAISE(ABORT, 'objective organization ownership is immutable'); END;
        `),
    },
    {
        version: 16,
        name: 'organization-delete-worktree-cascade',
        up: (database) => database.exec(`
          CREATE TRIGGER organizations_delete_worktree BEFORE DELETE ON organizations
          BEGIN
            DELETE FROM tasks WHERE project_id IN (
              SELECT projects.id FROM projects
              JOIN objectives ON objectives.id = projects.objective_id
              WHERE objectives.organization_id = OLD.id
            );
            DELETE FROM projects WHERE objective_id IN (
              SELECT id FROM objectives WHERE organization_id = OLD.id
            );
          END;
        `),
    },
    {
        version: 17,
        name: 'memory-owner-shape-constraints',
        up: (database) => database.exec(`
          CREATE TRIGGER memories_owner_shape_insert BEFORE INSERT ON memories
          WHEN NOT (
            (NEW.scope IN ('CEO', 'DIRECTOR') AND NEW.organization_id IS NOT NULL AND NEW.office_id IS NULL
              AND NEW.department_id IS NULL AND NEW.task_id IS NULL AND NEW.project_id IS NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope = 'OFFICE' AND NEW.organization_id IS NULL AND NEW.office_id IS NOT NULL
              AND NEW.department_id IS NULL AND NEW.task_id IS NULL AND NEW.project_id IS NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope = 'DEPARTMENT' AND NEW.organization_id IS NULL AND NEW.office_id IS NULL
              AND NEW.department_id IS NOT NULL AND NEW.task_id IS NULL AND NEW.project_id IS NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope = 'TASK' AND NEW.organization_id IS NULL AND NEW.office_id IS NULL
              AND NEW.department_id IS NULL AND NEW.task_id IS NOT NULL AND NEW.project_id IS NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope = 'PROJECT' AND NEW.organization_id IS NULL AND NEW.office_id IS NULL
              AND NEW.department_id IS NULL AND NEW.task_id IS NULL AND NEW.project_id IS NOT NULL AND NEW.objective_id IS NULL)
            OR (NEW.scope IN ('DECISION', 'KNOWLEDGE') AND
              (NEW.organization_id IS NOT NULL) + (NEW.office_id IS NOT NULL) + (NEW.department_id IS NOT NULL)
              + (NEW.task_id IS NOT NULL) + (NEW.project_id IS NOT NULL) + (NEW.objective_id IS NOT NULL) = 1)
          )
          BEGIN SELECT RAISE(ABORT, 'memory scope owner mismatch: invalid owner shape'); END;
        `),
    },
    {
        version: 18,
        name: 'memory-expiration-canonical-format',
        up: (database) => database.exec(`
          CREATE TRIGGER memories_expiration_format_insert BEFORE INSERT ON memories
          WHEN NEW.expires_at IS NOT NULL AND (
            length(NEW.expires_at) <> 24
            OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at) IS NOT NEW.expires_at
            OR date(NEW.expires_at, '+0 days') IS NOT substr(NEW.expires_at, 1, 10)
          )
          BEGIN SELECT RAISE(ABORT, 'memory expiration must be a canonical UTC timestamp'); END;

          CREATE TRIGGER memories_expiration_format_update BEFORE UPDATE OF expires_at ON memories
          WHEN NEW.expires_at IS NOT NULL AND (
            length(NEW.expires_at) <> 24
            OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at) IS NOT NEW.expires_at
            OR date(NEW.expires_at, '+0 days') IS NOT substr(NEW.expires_at, 1, 10)
          )
          BEGIN SELECT RAISE(ABORT, 'memory expiration must be a canonical UTC timestamp'); END;
        `),
    },
    {
        version: 19,
        name: 'employee-owned-memory-scope',
        up: (database) => database.exec(`
          DROP TRIGGER IF EXISTS memories_scope_owner_insert;
          DROP TRIGGER IF EXISTS memories_scope_owner_update;
          DROP TRIGGER IF EXISTS memories_owner_immutable;
          DROP TRIGGER IF EXISTS memories_owner_shape_insert;
          DROP TRIGGER IF EXISTS memories_expiration_format_insert;
          DROP TRIGGER IF EXISTS memories_expiration_format_update;

          ALTER TABLE memories RENAME TO memories_before_employee_scope;
          CREATE TABLE memories (
            id TEXT PRIMARY KEY NOT NULL,
            scope TEXT NOT NULL CHECK (scope IN ('CEO', 'DIRECTOR', 'OFFICE', 'DEPARTMENT', 'TASK', 'PROJECT', 'EMPLOYEE', 'DECISION', 'KNOWLEDGE')),
            category TEXT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            importance INTEGER NOT NULL DEFAULT 0 CHECK (importance BETWEEN 0 AND 3),
            verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
            organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
            office_id TEXT REFERENCES offices(id) ON DELETE CASCADE,
            department_id TEXT REFERENCES departments(id) ON DELETE CASCADE,
            task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
            objective_id TEXT REFERENCES objectives(id) ON DELETE CASCADE,
            agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            expires_at TEXT
          );
          INSERT INTO memories (id, scope, category, title, content, importance, verified, organization_id,
            office_id, department_id, task_id, project_id, objective_id, created_at, updated_at, expires_at)
          SELECT id, scope, category, title, content, importance, verified, organization_id, office_id,
            department_id, task_id, project_id, objective_id, created_at, updated_at, expires_at
          FROM memories_before_employee_scope;
          DROP TABLE memories_before_employee_scope;

          CREATE INDEX idx_memories_owner_organization ON memories(scope, organization_id, created_at, id) WHERE organization_id IS NOT NULL;
          CREATE INDEX idx_memories_owner_office ON memories(scope, office_id, created_at, id) WHERE office_id IS NOT NULL;
          CREATE INDEX idx_memories_owner_department ON memories(scope, department_id, created_at, id) WHERE department_id IS NOT NULL;
          CREATE INDEX idx_memories_owner_task ON memories(scope, task_id, created_at, id) WHERE task_id IS NOT NULL;
          CREATE INDEX idx_memories_owner_project ON memories(scope, project_id, created_at, id) WHERE project_id IS NOT NULL;
          CREATE INDEX idx_memories_owner_objective ON memories(scope, objective_id, created_at, id) WHERE objective_id IS NOT NULL;
          CREATE INDEX idx_memories_owner_agent ON memories(scope, agent_id, created_at, id) WHERE agent_id IS NOT NULL;
          CREATE INDEX idx_memories_expiration ON memories(expires_at, id) WHERE expires_at IS NOT NULL;

          CREATE TRIGGER memories_owner_shape_insert BEFORE INSERT ON memories
          WHEN NOT (
            (NEW.scope IN ('CEO', 'DIRECTOR') AND NEW.organization_id IS NOT NULL AND NEW.office_id IS NULL
              AND NEW.department_id IS NULL AND NEW.task_id IS NULL AND NEW.project_id IS NULL
              AND NEW.objective_id IS NULL AND NEW.agent_id IS NULL)
            OR (NEW.scope = 'OFFICE' AND NEW.organization_id IS NULL AND NEW.office_id IS NOT NULL
              AND NEW.department_id IS NULL AND NEW.task_id IS NULL AND NEW.project_id IS NULL
              AND NEW.objective_id IS NULL AND NEW.agent_id IS NULL)
            OR (NEW.scope = 'DEPARTMENT' AND NEW.organization_id IS NULL AND NEW.office_id IS NULL
              AND NEW.department_id IS NOT NULL AND NEW.task_id IS NULL AND NEW.project_id IS NULL
              AND NEW.objective_id IS NULL AND NEW.agent_id IS NULL)
            OR (NEW.scope = 'TASK' AND NEW.organization_id IS NULL AND NEW.office_id IS NULL
              AND NEW.department_id IS NULL AND NEW.task_id IS NOT NULL AND NEW.project_id IS NULL
              AND NEW.objective_id IS NULL AND NEW.agent_id IS NULL)
            OR (NEW.scope = 'PROJECT' AND NEW.organization_id IS NULL AND NEW.office_id IS NULL
              AND NEW.department_id IS NULL AND NEW.task_id IS NULL AND NEW.project_id IS NOT NULL
              AND NEW.objective_id IS NULL AND NEW.agent_id IS NULL)
            OR (NEW.scope = 'EMPLOYEE' AND NEW.organization_id IS NULL AND NEW.office_id IS NULL
              AND NEW.department_id IS NULL AND NEW.task_id IS NULL AND NEW.project_id IS NULL
              AND NEW.objective_id IS NULL AND NEW.agent_id IS NOT NULL)
            OR (NEW.scope IN ('DECISION', 'KNOWLEDGE') AND (NEW.organization_id IS NOT NULL) + (NEW.office_id IS NOT NULL)
              + (NEW.department_id IS NOT NULL) + (NEW.task_id IS NOT NULL) + (NEW.project_id IS NOT NULL)
              + (NEW.objective_id IS NOT NULL) + (NEW.agent_id IS NOT NULL) = 1)
          )
          BEGIN SELECT RAISE(ABORT, 'memory scope owner mismatch: invalid owner shape'); END;

          CREATE TRIGGER memories_owner_shape_update BEFORE UPDATE OF scope, organization_id, office_id,
            department_id, task_id, project_id, objective_id, agent_id ON memories
          WHEN NOT (
            (NEW.scope IN ('CEO', 'DIRECTOR') AND NEW.organization_id IS NOT NULL AND NEW.office_id IS NULL
              AND NEW.department_id IS NULL AND NEW.task_id IS NULL AND NEW.project_id IS NULL
              AND NEW.objective_id IS NULL AND NEW.agent_id IS NULL)
            OR (NEW.scope = 'OFFICE' AND NEW.organization_id IS NULL AND NEW.office_id IS NOT NULL
              AND NEW.department_id IS NULL AND NEW.task_id IS NULL AND NEW.project_id IS NULL
              AND NEW.objective_id IS NULL AND NEW.agent_id IS NULL)
            OR (NEW.scope = 'DEPARTMENT' AND NEW.organization_id IS NULL AND NEW.office_id IS NULL
              AND NEW.department_id IS NOT NULL AND NEW.task_id IS NULL AND NEW.project_id IS NULL
              AND NEW.objective_id IS NULL AND NEW.agent_id IS NULL)
            OR (NEW.scope = 'TASK' AND NEW.organization_id IS NULL AND NEW.office_id IS NULL
              AND NEW.department_id IS NULL AND NEW.task_id IS NOT NULL AND NEW.project_id IS NULL
              AND NEW.objective_id IS NULL AND NEW.agent_id IS NULL)
            OR (NEW.scope = 'PROJECT' AND NEW.organization_id IS NULL AND NEW.office_id IS NULL
              AND NEW.department_id IS NULL AND NEW.task_id IS NULL AND NEW.project_id IS NOT NULL
              AND NEW.objective_id IS NULL AND NEW.agent_id IS NULL)
            OR (NEW.scope = 'EMPLOYEE' AND NEW.organization_id IS NULL AND NEW.office_id IS NULL
              AND NEW.department_id IS NULL AND NEW.task_id IS NULL AND NEW.project_id IS NULL
              AND NEW.objective_id IS NULL AND NEW.agent_id IS NOT NULL)
            OR (NEW.scope IN ('DECISION', 'KNOWLEDGE') AND (NEW.organization_id IS NOT NULL) + (NEW.office_id IS NOT NULL)
              + (NEW.department_id IS NOT NULL) + (NEW.task_id IS NOT NULL) + (NEW.project_id IS NOT NULL)
              + (NEW.objective_id IS NOT NULL) + (NEW.agent_id IS NOT NULL) = 1)
          )
          BEGIN SELECT RAISE(ABORT, 'memory scope owner mismatch: invalid owner shape'); END;

          CREATE TRIGGER memories_owner_immutable BEFORE UPDATE OF scope, organization_id, office_id, department_id,
            task_id, project_id, objective_id, agent_id ON memories
          WHEN NEW.scope IS NOT OLD.scope OR NEW.organization_id IS NOT OLD.organization_id
            OR NEW.office_id IS NOT OLD.office_id OR NEW.department_id IS NOT OLD.department_id
            OR NEW.task_id IS NOT OLD.task_id OR NEW.project_id IS NOT OLD.project_id
            OR NEW.objective_id IS NOT OLD.objective_id OR NEW.agent_id IS NOT OLD.agent_id
          BEGIN SELECT RAISE(ABORT, 'memory scope owner mismatch: ownership is immutable'); END;

          CREATE TRIGGER memories_expiration_format_insert BEFORE INSERT ON memories
          WHEN NEW.expires_at IS NOT NULL AND (length(NEW.expires_at) <> 24
            OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at) IS NOT NEW.expires_at
            OR date(NEW.expires_at, '+0 days') IS NOT substr(NEW.expires_at, 1, 10))
          BEGIN SELECT RAISE(ABORT, 'memory expiration must be a canonical UTC timestamp'); END;

          CREATE TRIGGER memories_expiration_format_update BEFORE UPDATE OF expires_at ON memories
          WHEN NEW.expires_at IS NOT NULL AND (length(NEW.expires_at) <> 24
            OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.expires_at) IS NOT NEW.expires_at
            OR date(NEW.expires_at, '+0 days') IS NOT substr(NEW.expires_at, 1, 10))
          BEGIN SELECT RAISE(ABORT, 'memory expiration must be a canonical UTC timestamp'); END;
        `),
    },
    {
        version: 20,
        name: 'immutable-engineering-decision-records',
        up: (database) => database.exec(`
          CREATE TABLE engineering_decisions (
            id TEXT PRIMARY KEY NOT NULL,
            task_id TEXT NOT NULL,
            author_id TEXT NOT NULL,
            context TEXT NOT NULL,
            options_json TEXT NOT NULL,
            selected_option TEXT NOT NULL,
            rejected_options_json TEXT NOT NULL,
            reason TEXT NOT NULL,
            trade_offs_json TEXT NOT NULL,
            evidence_json TEXT NOT NULL,
            confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          );
          CREATE INDEX idx_engineering_decisions_task ON engineering_decisions(task_id, created_at, id);
          CREATE TRIGGER engineering_decisions_no_update BEFORE UPDATE ON engineering_decisions
            BEGIN SELECT RAISE(ABORT, 'engineering decision records are immutable'); END;
          CREATE TRIGGER engineering_decisions_no_delete BEFORE DELETE ON engineering_decisions
            BEGIN SELECT RAISE(ABORT, 'engineering decision records are immutable'); END;
        `),
    },
    {
        version: 21,
        name: 'memory-invalidation-tombstones',
        up: (database) => database.exec(`
          ALTER TABLE memories ADD COLUMN invalidated_at TEXT;
          CREATE TRIGGER memories_invalidation_format_insert BEFORE INSERT ON memories
            WHEN NEW.invalidated_at IS NOT NULL AND (length(NEW.invalidated_at) <> 24
              OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.invalidated_at) IS NOT NEW.invalidated_at
              OR date(NEW.invalidated_at, '+0 days') IS NOT substr(NEW.invalidated_at, 1, 10))
            BEGIN SELECT RAISE(ABORT, 'memory invalidation must be a canonical UTC timestamp'); END;
          CREATE TRIGGER memories_invalidation_format_update BEFORE UPDATE OF invalidated_at ON memories
            WHEN NEW.invalidated_at IS NOT NULL AND (length(NEW.invalidated_at) <> 24
              OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.invalidated_at) IS NOT NEW.invalidated_at
              OR date(NEW.invalidated_at, '+0 days') IS NOT substr(NEW.invalidated_at, 1, 10))
            BEGIN SELECT RAISE(ABORT, 'memory invalidation must be a canonical UTC timestamp'); END;
          CREATE TRIGGER memories_invalidation_one_way BEFORE UPDATE OF invalidated_at ON memories
            WHEN OLD.invalidated_at IS NOT NULL AND NEW.invalidated_at IS NOT OLD.invalidated_at
            BEGIN SELECT RAISE(ABORT, 'memory invalidation is irreversible'); END;
          CREATE INDEX idx_memories_active_organization ON memories(scope, organization_id, invalidated_at, expires_at, created_at, id)
            WHERE organization_id IS NOT NULL;
          CREATE INDEX idx_memories_active_office ON memories(scope, office_id, invalidated_at, expires_at, created_at, id)
            WHERE office_id IS NOT NULL;
          CREATE INDEX idx_memories_active_department ON memories(scope, department_id, invalidated_at, expires_at, created_at, id)
            WHERE department_id IS NOT NULL;
          CREATE INDEX idx_memories_active_task ON memories(scope, task_id, invalidated_at, expires_at, created_at, id)
            WHERE task_id IS NOT NULL;
          CREATE INDEX idx_memories_active_project ON memories(scope, project_id, invalidated_at, expires_at, created_at, id)
            WHERE project_id IS NOT NULL;
          CREATE INDEX idx_memories_active_objective ON memories(scope, objective_id, invalidated_at, expires_at, created_at, id)
            WHERE objective_id IS NOT NULL;
          CREATE INDEX idx_memories_active_employee ON memories(scope, agent_id, invalidated_at, expires_at, created_at, id)
            WHERE agent_id IS NOT NULL;
        `),
    },
    {
        version: 22,
        name: 'persisted-execution-retry-reason',
        up: (database) => database.exec(`
          ALTER TABLE tasks ADD COLUMN execution_retry_reason TEXT;
        `),
    },
    {
        version: 23,
        name: 'failed-execution-queue-state',
        up: (database) => database.exec(`
          ALTER TABLE execution_queue RENAME TO execution_queue_legacy;
          DROP INDEX IF EXISTS idx_execution_queue_ready;
          CREATE TABLE execution_queue (
            id TEXT PRIMARY KEY NOT NULL,
            task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
            state TEXT NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED', 'CLAIMED', 'COMPLETED', 'FAILED', 'CANCELLED')),
            queued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          );
          INSERT INTO execution_queue (id, task_id, state, queued_at, updated_at)
            SELECT id, task_id, state, queued_at, updated_at FROM execution_queue_legacy;
          DROP TABLE execution_queue_legacy;
          CREATE INDEX idx_execution_queue_ready ON execution_queue(state, queued_at, task_id);
        `),
    },
    {
        version: 24,
        name: 'persisted-task-tool-permissions',
        up: (database) => database.exec(`
          ALTER TABLE tasks ADD COLUMN tool_permissions_json TEXT
            CHECK (tool_permissions_json IS NULL OR json_valid(tool_permissions_json));
          CREATE TRIGGER tasks_tool_permissions_pending_only
            BEFORE UPDATE OF tool_permissions_json ON tasks
            WHEN OLD.tool_permissions_json IS NOT NEW.tool_permissions_json AND (
              OLD.status NOT IN ('CREATED', 'ASSIGNED')
              OR EXISTS (SELECT 1 FROM execution_queue WHERE task_id = OLD.id)
            )
            BEGIN SELECT RAISE(ABORT, 'task tool permissions are immutable after queueing or execution start'); END;
        `),
    },
    {
        version: 25,
        name: 'memory-source-provenance',
        up: (database) => database.exec(`
          ALTER TABLE memories ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'LEGACY'
            CHECK (source_kind IN ('LEGACY', 'USER_NOTE', 'OBSERVATION', 'TASK_RESULT', 'REVIEW_FINDING',
              'DECISION_RECORD', 'TEST_RESULT', 'AI_GENERATED'));
          ALTER TABLE memories ADD COLUMN source_reference TEXT;
          ALTER TABLE memories ADD COLUMN verified_by_agent_id TEXT;
          ALTER TABLE memories ADD COLUMN verified_at TEXT;
          ALTER TABLE memories ADD COLUMN verification_note TEXT;

          CREATE TRIGGER memories_verification_provenance_insert BEFORE INSERT ON memories
          WHEN NEW.verified = 1 AND (NEW.source_kind = 'AI_GENERATED'
            OR NEW.source_reference IS NULL OR length(trim(NEW.source_reference)) = 0 OR length(NEW.source_reference) > 300
            OR NEW.verified_by_agent_id IS NULL OR length(trim(NEW.verified_by_agent_id)) = 0
            OR length(NEW.verified_by_agent_id) > 200 OR length(COALESCE(NEW.verification_note, '')) > 500
            OR NEW.verified_at IS NULL OR length(NEW.verified_at) <> 24
            OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.verified_at) IS NOT NEW.verified_at)
          BEGIN SELECT RAISE(ABORT, 'verified memory requires non-AI source provenance and verifier attribution'); END;

          CREATE TRIGGER memories_verification_provenance_update BEFORE UPDATE OF verified, source_kind,
            source_reference, verified_by_agent_id, verified_at ON memories
          WHEN NEW.verified = 1 AND (NEW.source_kind = 'AI_GENERATED'
            OR NEW.source_reference IS NULL OR length(trim(NEW.source_reference)) = 0 OR length(NEW.source_reference) > 300
            OR NEW.verified_by_agent_id IS NULL OR length(trim(NEW.verified_by_agent_id)) = 0
            OR length(NEW.verified_by_agent_id) > 200 OR length(COALESCE(NEW.verification_note, '')) > 500
            OR NEW.verified_at IS NULL OR length(NEW.verified_at) <> 24
            OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.verified_at) IS NOT NEW.verified_at)
          BEGIN SELECT RAISE(ABORT, 'verified memory requires non-AI source provenance and verifier attribution'); END;

          CREATE TRIGGER memories_source_provenance_immutable BEFORE UPDATE OF source_kind, source_reference ON memories
          WHEN NEW.source_kind IS NOT OLD.source_kind OR NEW.source_reference IS NOT OLD.source_reference
          BEGIN SELECT RAISE(ABORT, 'memory source provenance is immutable'); END;

          CREATE TRIGGER memories_verification_attribution_immutable BEFORE UPDATE OF verified_by_agent_id, verified_at, verification_note ON memories
          WHEN OLD.verified = 1 AND (NEW.verified_by_agent_id IS NOT OLD.verified_by_agent_id
            OR NEW.verified_at IS NOT OLD.verified_at OR NEW.verification_note IS NOT OLD.verification_note)
          BEGIN SELECT RAISE(ABORT, 'verified memory attribution is immutable'); END;

          CREATE TRIGGER memories_verified_state_immutable BEFORE UPDATE OF verified ON memories
          WHEN OLD.verified = 1 AND NEW.verified <> 1
          BEGIN SELECT RAISE(ABORT, 'verified memory state cannot be downgraded'); END;

          CREATE TRIGGER memories_verified_content_immutable BEFORE UPDATE OF title, category, content, importance ON memories
          WHEN (OLD.verified = 1 OR NEW.verified = 1) AND (
            NEW.title IS NOT OLD.title OR NEW.category IS NOT OLD.category OR NEW.content IS NOT OLD.content
            OR NEW.importance IS NOT OLD.importance)
          BEGIN SELECT RAISE(ABORT, 'verified memory content cannot be changed'); END;

          CREATE INDEX idx_memories_source_reference ON memories(source_kind, source_reference) WHERE source_reference IS NOT NULL;
        `),
    },
    {
        version: 26,
        name: 'bounded-debugging-sessions',
        up: (database) => database.exec(`
          CREATE TABLE debugging_sessions (
            id TEXT PRIMARY KEY NOT NULL,
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            created_by_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
            status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'STOPPED', 'ESCALATED', 'RESOLVED')),
            stage TEXT NOT NULL DEFAULT 'REPRODUCE' CHECK (stage IN ('REPRODUCE', 'INSPECT', 'HYPOTHESIS', 'TEST_HYPOTHESIS', 'PATCH', 'TEST', 'REVIEW', 'VERIFY')),
            attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 30),
            failed_test_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_test_count >= 0 AND failed_test_count <= 3),
            max_attempts INTEGER NOT NULL CHECK (max_attempts BETWEEN 1 AND 3),
            file_budget INTEGER NOT NULL CHECK (file_budget BETWEEN 1 AND 20),
            files_touched INTEGER NOT NULL DEFAULT 0 CHECK (files_touched >= 0 AND files_touched <= file_budget),
            command_budget INTEGER NOT NULL CHECK (command_budget BETWEEN 1 AND 20),
            commands_run INTEGER NOT NULL DEFAULT 0 CHECK (commands_run >= 0 AND commands_run <= command_budget),
            token_budget INTEGER NOT NULL CHECK (token_budget BETWEEN 1 AND 50000),
            tokens_used INTEGER NOT NULL DEFAULT 0 CHECK (tokens_used >= 0 AND tokens_used <= token_budget),
            time_budget_ms INTEGER NOT NULL CHECK (time_budget_ms BETWEEN 1000 AND 900000),
            started_at TEXT NOT NULL,
            deadline_at TEXT NOT NULL,
            stop_reason TEXT,
            final_summary TEXT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            CHECK (length(started_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', started_at) IS started_at),
            CHECK (length(deadline_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', deadline_at) IS deadline_at)
          );
          CREATE TABLE debugging_steps (
            id TEXT PRIMARY KEY NOT NULL,
            session_id TEXT NOT NULL REFERENCES debugging_sessions(id) ON DELETE CASCADE,
            sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 30),
            stage TEXT NOT NULL CHECK (stage IN ('REPRODUCE', 'INSPECT', 'HYPOTHESIS', 'TEST_HYPOTHESIS', 'PATCH', 'TEST', 'REVIEW', 'VERIFY')),
            outcome TEXT NOT NULL CHECK (outcome IN ('PASS', 'FAIL', 'BLOCKED')),
            summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 2000),
            confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
            files_json TEXT NOT NULL CHECK (json_valid(files_json)),
            commands_run INTEGER NOT NULL CHECK (commands_run BETWEEN 0 AND 20),
            tokens_used INTEGER NOT NULL CHECK (tokens_used BETWEEN 0 AND 50000),
            duration_ms INTEGER NOT NULL CHECK (duration_ms BETWEEN 0 AND 900000),
            created_at TEXT NOT NULL,
            UNIQUE(session_id, sequence)
          );
          CREATE INDEX idx_debugging_sessions_task ON debugging_sessions(task_id, created_at, id);
          CREATE INDEX idx_debugging_steps_session ON debugging_steps(session_id, sequence);
          CREATE TRIGGER debugging_session_policy_immutable BEFORE UPDATE OF task_id, created_by_agent_id, max_attempts,
            file_budget, command_budget, token_budget, time_budget_ms, started_at, deadline_at ON debugging_sessions
          BEGIN SELECT RAISE(ABORT, 'debugging session identity and budgets are immutable'); END;
          CREATE TRIGGER debugging_session_terminal_immutable BEFORE UPDATE ON debugging_sessions
          WHEN OLD.status <> 'ACTIVE'
          BEGIN SELECT RAISE(ABORT, 'terminal debugging sessions are immutable'); END;
          CREATE TRIGGER debugging_steps_immutable BEFORE UPDATE ON debugging_steps
          BEGIN SELECT RAISE(ABORT, 'debugging step records are immutable'); END;
          ALTER TABLE retention_runs ADD COLUMN debugging_deleted INTEGER NOT NULL DEFAULT 0 CHECK (debugging_deleted >= 0);
        `),
    },
    {
        version: 27,
        name: 'engineering-decision-lineage',
        up: (database) => database.exec(`
          CREATE TABLE engineering_decision_links (
            id TEXT PRIMARY KEY NOT NULL,
            source_decision_id TEXT NOT NULL REFERENCES engineering_decisions(id) ON DELETE CASCADE,
            target_decision_id TEXT NOT NULL REFERENCES engineering_decisions(id) ON DELETE CASCADE,
            relationship TEXT NOT NULL CHECK (relationship IN ('SUPERSEDES', 'RELATED_TO')),
            created_by_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            CHECK (source_decision_id <> target_decision_id),
            UNIQUE(source_decision_id, target_decision_id, relationship)
          );
          CREATE INDEX idx_engineering_decision_links_source ON engineering_decision_links(source_decision_id, created_at, id);
          CREATE INDEX idx_engineering_decision_links_target ON engineering_decision_links(target_decision_id, created_at, id);
          CREATE TRIGGER engineering_decision_links_same_organization BEFORE INSERT ON engineering_decision_links
          WHEN (SELECT o.organization_id FROM engineering_decisions d JOIN tasks t ON t.id = d.task_id
            JOIN projects p ON p.id = t.project_id JOIN objectives o ON o.id = p.objective_id
            WHERE d.id = NEW.source_decision_id) IS NOT
            (SELECT o.organization_id FROM engineering_decisions d JOIN tasks t ON t.id = d.task_id
            JOIN projects p ON p.id = t.project_id JOIN objectives o ON o.id = p.objective_id
            WHERE d.id = NEW.target_decision_id)
          BEGIN SELECT RAISE(ABORT, 'engineering decision links must stay within one organization'); END;
          CREATE TRIGGER engineering_decision_links_no_update BEFORE UPDATE ON engineering_decision_links
          BEGIN SELECT RAISE(ABORT, 'engineering decision links are immutable'); END;
          CREATE TRIGGER engineering_decision_links_no_delete BEFORE DELETE ON engineering_decision_links
          BEGIN SELECT RAISE(ABORT, 'engineering decision links are immutable'); END;
          CREATE TRIGGER engineering_decision_supersession_acyclic BEFORE INSERT ON engineering_decision_links
          WHEN NEW.relationship = 'SUPERSEDES'
          BEGIN
            SELECT CASE WHEN EXISTS (
              WITH RECURSIVE lineage(id) AS (
                SELECT target_decision_id FROM engineering_decision_links
                  WHERE relationship = 'SUPERSEDES' AND source_decision_id = NEW.target_decision_id
                UNION
                SELECT l.target_decision_id FROM engineering_decision_links l JOIN lineage x
                  ON l.source_decision_id = x.id WHERE l.relationship = 'SUPERSEDES'
              ) SELECT 1 FROM lineage WHERE id = NEW.source_decision_id
            ) THEN RAISE(ABORT, 'engineering decision supersession cycle') END;
          END;
        `),
    },
    {
        version: 28,
        name: 'debugging-tool-action-attribution',
        up: (database) => database.exec(`
          ALTER TABLE debugging_steps ADD COLUMN tool_action TEXT
            CHECK (tool_action IS NULL OR tool_action IN ('READ_FILE', 'EXECUTE_COMMAND', 'WRITE_FILE', 'RECORD_HYPOTHESIS'));
          ALTER TABLE debugging_steps ADD COLUMN command_summary TEXT
            CHECK (command_summary IS NULL OR length(command_summary) <= 500);
        `),
    },
    {
        version: 29,
        name: 'ai-usage-provider-attribution',
        up: (database) => database.exec(`
          ALTER TABLE ai_usages ADD COLUMN provider TEXT
            CHECK (provider IS NULL OR length(provider) BETWEEN 1 AND 120);
          CREATE INDEX idx_ai_usages_task_provider_model ON ai_usages(task_id, provider, model, created_at);
        `),
    },
    {
        version: 30,
        name: 'ai-usage-cost-confidence',
        up: (database) => database.exec(`
          ALTER TABLE ai_usages ADD COLUMN cost_known INTEGER NOT NULL DEFAULT 0 CHECK (cost_known IN (0, 1));
          UPDATE ai_usages SET cost_known = 1 WHERE estimated_cost > 0;
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
